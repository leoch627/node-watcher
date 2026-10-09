const net = require('net');
const os = require('os');
const tls = require('tls');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const { PROTOCOL_VERSION, encode, FrameDecoder, normalizeFingerprint } = require('./protocol');

const MAX_BACKOFF_MS = 30000;
// After being rejected (bad token) or replaced by another probe using the same join string, retrying
// quickly would only fight the master or the other probe; wait longer instead.
const SLOW_RETRY_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MS = 65000;

// Connects a probe to the master and runs what the master asks for.
// handlers: {
//   loadNodes(nodes)                       -> Promise
//   check({ timeout, retries, url, concurrency }) -> Promise<{ mihomoReady, results }>
//   media(nodeIds, emit(nodeId, media))    -> Promise<{ errors }>
//   isReady()                              -> boolean
// }
// Events: 'connected' (probe), 'disconnected' (reason), 'fatal' (error)
class ProbeClient extends EventEmitter {
  constructor({ host, port, id, token, fingerprint, version = '', handlers }) {
    super();
    this.host = host;
    this.port = port;
    this.id = id;
    this.token = token;
    this.fingerprint = fingerprint ? normalizeFingerprint(fingerprint) : null;
    this.version = version;
    this.handlers = handlers;
    this.socket = null;
    this.connected = false;
    this.stopped = false;
    this.attempts = 0;
    this.reconnectTimer = null;
    this.watchdog = null;
    this.lastReceived = 0;
    this.queue = Promise.resolve();
    this.slowRetry = false;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.watchdog);
    this.socket?.destroy();
  }

  connect() {
    if (this.stopped) return;
    const options = { host: this.host, port: this.port, minVersion: 'TLSv1.3' };
    if (!net.isIP(this.host)) options.servername = this.host;
    // With a pinned fingerprint the certificate is checked by hash below; otherwise normal CA validation applies.
    if (this.fingerprint) options.rejectUnauthorized = false;
    const socket = tls.connect(options);
    this.socket = socket;
    const decoder = new FrameDecoder();
    let authenticated = false;

    socket.once('secureConnect', () => {
      if (this.fingerprint) {
        const peer = socket.getPeerX509Certificate?.();
        const actual = peer ? normalizeFingerprint(peer.fingerprint256) : null;
        if (actual !== this.fingerprint) {
          logger.error(`Master certificate fingerprint mismatch (got ${actual || 'none'}); refusing to connect`);
          socket.destroy();
          return;
        }
      }
      this.lastReceived = Date.now();
      this.send({
        t: 'hello', v: PROTOCOL_VERSION, id: this.id, token: this.token, version: this.version,
        hostname: os.hostname(), mihomoReady: this.handlers.isReady()
      });
    });

    socket.on('data', chunk => {
      this.lastReceived = Date.now();
      let messages;
      try {
        messages = decoder.push(chunk);
      } catch (error) {
        logger.error(`Protocol error from master: ${error.message}`);
        socket.destroy();
        return;
      }
      for (const message of messages) {
        if (message.t === 'welcome') {
          authenticated = true;
          this.connected = true;
          this.attempts = 0;
          this.slowRetry = false;
          logger.info(`Connected to master as probe "${message.probe?.name}" (${message.probe?.id})`);
          this.emit('connected', message.probe);
          continue;
        }
        if (message.t === 'error') {
          logger.error(`Master: ${message.message}`);
          if (!authenticated && /Authentication failed|Unsupported protocol/.test(message.message)) {
            this.slowRetry = true;
            this.emit('fatal', new Error(message.message));
          } else if (/Replaced by a new connection/.test(message.message)) {
            this.slowRetry = true;
            logger.error('Another probe connected with the same join string. Each probe needs its own join string '
              + '(create one per probe in Settings → Probes). Retrying in 5 minutes.');
          }
          continue;
        }
        if (authenticated) this.handle(message);
      }
    });

    socket.on('error', error => {
      if (!this.stopped) logger.warn(`Master connection error: ${error.message}`);
    });
    socket.on('close', () => {
      const was = this.connected;
      this.connected = false;
      this.socket = null;
      if (was) this.emit('disconnected', 'closed');
      this.scheduleReconnect();
    });

    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.socket === socket && Date.now() - this.lastReceived > IDLE_TIMEOUT_MS) {
        logger.warn('No traffic from master, reconnecting');
        socket.destroy();
      }
    }, 10000);
    this.watchdog.unref?.();
  }

  scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    this.attempts += 1;
    const base = this.slowRetry ? SLOW_RETRY_MS : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts - 1, 5));
    const delay = Math.round(base * (0.75 + Math.random() * 0.5));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
    this.reconnectTimer.unref?.();
  }

  send(message) {
    if (!this.socket) return false;
    try {
      this.socket.write(encode(message));
      return true;
    } catch (error) {
      logger.warn(`Could not send to master: ${error.message}`);
      return false;
    }
  }

  reportStatus() {
    if (this.connected) this.send({ t: 'status', mihomoReady: this.handlers.isReady() });
  }

  // Work items run one after another so a slow media check cannot overlap a node reload.
  enqueue(task) {
    this.queue = this.queue.then(task, task).catch(error => logger.error(`Probe task failed: ${error.message}`));
    return this.queue;
  }

  handle(message) {
    switch (message.t) {
      case 'ping':
        this.send({ t: 'pong', ts: message.ts });
        break;
      case 'nodes':
        this.enqueue(async () => {
          const nodes = Array.isArray(message.nodes) ? message.nodes : [];
          try {
            await this.handlers.loadNodes(nodes);
          } catch (error) {
            logger.error(`Could not load ${nodes.length} nodes: ${error.message}`);
          }
          this.send({ t: 'nodesAck', revision: message.revision, mihomoReady: this.handlers.isReady() });
        });
        break;
      case 'check':
        this.enqueue(async () => {
          let outcome;
          try {
            outcome = await this.handlers.check({
              timeout: Number(message.timeout) || 10000,
              retries: Math.max(0, Math.min(3, Number(message.retries) || 0)),
              url: message.url || undefined,
              concurrency: Math.max(1, Math.min(32, Number(message.concurrency) || 8))
            });
          } catch (error) {
            outcome = { mihomoReady: this.handlers.isReady(), results: [], error: error.message };
          }
          this.send({ t: 'checkResult', job: message.job, ...outcome });
        });
        break;
      case 'media':
        this.enqueue(async () => {
          let outcome;
          try {
            outcome = await this.handlers.media(Array.isArray(message.nodeIds) ? message.nodeIds : [],
              (nodeId, media) => this.send({ t: 'mediaItem', job: message.job, nodeId, media }));
          } catch (error) {
            outcome = { errors: 1, error: error.message };
          }
          this.send({ t: 'mediaDone', job: message.job, ...outcome });
        });
        break;
      default:
        break;
    }
  }
}

module.exports = { ProbeClient };
