const crypto = require('crypto');
const tls = require('tls');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const { PROTOCOL_VERSION, MAX_FRAME_BYTES, MAX_HELLO_BYTES, encode, FrameDecoder } = require('./protocol');

const HANDSHAKE_TIMEOUT_MS = 10000;
const HEARTBEAT_MS = 20000;
const IDLE_TIMEOUT_MS = 65000;
const AUTH_FAIL_LIMIT = 10;
const AUTH_FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_PENDING_HANDSHAKES = 64;

// Wire-safe copy of a runtime node: what a remote probe needs to load it into Mihomo.
function wireNode(node) {
  return {
    id: node.id, name: node.name, proxyName: node.proxyName, protocol: node.protocol,
    server: node.server, port: node.port, region: node.region || null, proxy: node.proxy
  };
}

class Session {
  constructor(hub, socket, probe, hello) {
    this.hub = hub;
    this.socket = socket;
    this.probe = probe;
    this.address = socket.remoteAddress;
    this.version = String(hello.version || '').slice(0, 40);
    this.hostname = String(hello.hostname || '').slice(0, 80);
    this.mihomoReady = Boolean(hello.mihomoReady);
    this.nodesRevision = null;
    this.connectedAt = Date.now();
    this.lastSeen = Date.now();
    this.pending = new Map();
    this.closed = false;
  }

  send(message) {
    if (this.closed) return false;
    try {
      this.socket.write(encode(message));
      return true;
    } catch (error) {
      logger.warn(`Could not send to probe ${this.probe.id}: ${error.message}`);
      return false;
    }
  }

  request(message, timeoutMs, onItem) {
    const job = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(job);
        reject(new Error(`Probe ${this.probe.name} did not answer within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(job, { resolve, reject, timer, onItem });
      if (!this.send({ ...message, job })) {
        clearTimeout(timer);
        this.pending.delete(job);
        reject(new Error(`Probe ${this.probe.name} is not connected`));
      }
    });
  }

  settle(job, error, value) {
    const entry = this.pending.get(job);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(job);
    if (error) entry.reject(error);
    else entry.resolve(value);
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    for (const job of [...this.pending.keys()]) this.settle(job, new Error(`Probe ${this.probe.name} disconnected`));
    if (reason) {
      try { this.socket.write(encode({ t: 'error', message: reason })); } catch (_) { /* closing anyway */ }
    }
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref?.();
  }

  info() {
    return {
      address: this.address, version: this.version, hostname: this.hostname,
      mihomoReady: this.mihomoReady, connectedAt: new Date(this.connectedAt).toISOString(),
      lastSeen: new Date(this.lastSeen).toISOString(), nodesRevision: this.nodesRevision
    };
  }
}

// TLS listener for remote probes on the master.
// Events: 'connect' (probe), 'disconnect' (probe), 'status' (probe)
class ProbeHub extends EventEmitter {
  constructor({ registry, cert, key, host = '0.0.0.0', port = 7443 }) {
    super();
    this.registry = registry;
    this.cert = cert;
    this.key = key;
    this.host = host;
    this.port = port;
    this.sessions = new Map();
    this.lastSeen = new Map();
    this.failures = new Map();
    this.handshakes = 0;
    this.nodes = [];
    this.revision = 0;
    this.server = null;
    this.heartbeat = null;
    registry.hub = this;
  }

  start() {
    this.server = tls.createServer({ cert: this.cert, key: this.key, minVersion: 'TLSv1.3' }, socket => this.accept(socket));
    this.server.on('tlsClientError', () => { /* scanners and failed handshakes: ignore */ });
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.heartbeat.unref?.();
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        this.port = this.server.address().port;
        logger.info(`Probe listener on ${this.host}:${this.port} (TLS 1.3)`);
        resolve(this.port);
      });
    });
  }

  async stop() {
    clearInterval(this.heartbeat);
    for (const session of this.sessions.values()) session.close('Master shutting down');
    if (this.server) await new Promise(resolve => this.server.close(() => resolve()));
  }

  blocked(address, now = Date.now()) {
    const entry = this.failures.get(address);
    if (!entry || now - entry.since > AUTH_FAIL_WINDOW_MS) {
      this.failures.delete(address);
      return false;
    }
    return entry.count >= AUTH_FAIL_LIMIT;
  }

  noteFailure(address, now = Date.now()) {
    const entry = this.failures.get(address);
    if (!entry || now - entry.since > AUTH_FAIL_WINDOW_MS) this.failures.set(address, { count: 1, since: now });
    else entry.count += 1;
    if (this.failures.size > 5000) this.failures.clear();
  }

  accept(socket) {
    const address = socket.remoteAddress || 'unknown';
    if (this.blocked(address) || this.handshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.handshakes += 1;
    let session = null;
    let handshaking = true;
    const finishHandshake = () => {
      if (handshaking) { handshaking = false; this.handshakes -= 1; }
    };
    const decoder = new FrameDecoder(MAX_HELLO_BYTES);
    const timer = setTimeout(() => { finishHandshake(); socket.destroy(); }, HANDSHAKE_TIMEOUT_MS);
    timer.unref?.();
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);

    socket.on('data', chunk => {
      let messages;
      try {
        messages = decoder.push(chunk);
      } catch (error) {
        logger.warn(`Probe connection from ${address} dropped: ${error.message}`);
        socket.destroy();
        return;
      }
      for (const message of messages) {
        if (!session) {
          clearTimeout(timer);
          finishHandshake();
          session = this.authenticate(socket, address, message);
          if (!session) return;
          decoder.maxFrameBytes = MAX_FRAME_BYTES;
          continue;
        }
        session.lastSeen = Date.now();
        this.handle(session, message);
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      finishHandshake();
      if (session) this.detach(session);
    });
  }

  authenticate(socket, address, hello) {
    const reject = (reason, countFailure = true) => {
      if (countFailure) this.noteFailure(address);
      try { socket.write(encode({ t: 'error', message: reason })); } catch (_) { /* ignore */ }
      socket.end();
      setTimeout(() => socket.destroy(), 500).unref?.();
      return null;
    };
    if (hello.t !== 'hello') return reject('Expected hello');
    if (Number(hello.v) !== PROTOCOL_VERSION) return reject(`Unsupported protocol version ${hello.v}`, false);
    const probe = this.registry.authenticate(hello.id, hello.token);
    if (!probe) {
      logger.warn(`Probe authentication failed from ${address} (id ${String(hello.id).slice(0, 40)})`);
      return reject('Authentication failed');
    }
    this.failures.delete(address);
    const previous = this.sessions.get(probe.id);
    if (previous) {
      if (Date.now() - previous.lastSeen < 30000) {
        logger.warn(`Probe ${probe.name} (${probe.id}) connected from ${address} while still active at ${previous.address}; `
          + 'two hosts may be sharing one join string. Keeping the new connection.');
      }
      previous.replaced = true;
      previous.close('Replaced by a new connection');
    }
    const session = new Session(this, socket, probe, hello);
    this.sessions.set(probe.id, session);
    this.lastSeen.set(probe.id, new Date().toISOString());
    session.send({ t: 'welcome', probe: { id: probe.id, name: probe.name }, heartbeatMs: HEARTBEAT_MS });
    this.sendNodes(session);
    logger.info(`Probe ${probe.name} (${probe.id}) connected from ${address}`);
    this.emit('connect', probe);
    return session;
  }

  detach(session) {
    if (this.sessions.get(session.probe.id) === session) {
      this.sessions.delete(session.probe.id);
      this.lastSeen.set(session.probe.id, new Date(session.lastSeen).toISOString());
      logger.warn(`Probe ${session.probe.name} (${session.probe.id}) disconnected`);
      session.close();
      if (!session.replaced) this.emit('disconnect', session.probe);
    } else {
      session.close();
    }
  }

  handle(session, message) {
    switch (message.t) {
      case 'ping':
        session.send({ t: 'pong', ts: message.ts });
        break;
      case 'pong':
        break;
      case 'status':
        session.mihomoReady = Boolean(message.mihomoReady);
        this.emit('status', session.probe);
        break;
      case 'nodesAck':
        session.nodesRevision = message.revision;
        session.mihomoReady = Boolean(message.mihomoReady);
        break;
      case 'checkResult':
        session.mihomoReady = Boolean(message.mihomoReady);
        session.settle(message.job, null, message);
        break;
      case 'mediaItem': {
        const entry = session.pending.get(message.job);
        if (entry?.onItem) {
          try { entry.onItem(message.nodeId, message.media); } catch (error) { logger.warn(`Media item handler failed: ${error.message}`); }
        }
        break;
      }
      case 'mediaDone':
        session.settle(message.job, null, message);
        break;
      case 'error':
        logger.warn(`Probe ${session.probe.name} reported: ${String(message.message).slice(0, 200)}`);
        break;
      default:
        break;
    }
  }

  tick(now = Date.now()) {
    for (const session of this.sessions.values()) {
      if (now - session.lastSeen > IDLE_TIMEOUT_MS) {
        logger.warn(`Probe ${session.probe.name} timed out`);
        session.socket.destroy();
        continue;
      }
      session.send({ t: 'ping', ts: now });
    }
  }

  sendNodes(session) {
    session.send({ t: 'nodes', revision: this.revision, nodes: this.nodes });
  }

  broadcastNodes(nodes) {
    this.nodes = nodes.map(wireNode);
    this.revision += 1;
    for (const session of this.sessions.values()) this.sendNodes(session);
  }

  disconnect(probeId, reason) {
    this.sessions.get(probeId)?.close(reason);
  }

  connectedIds() {
    return [...this.sessions.keys()];
  }

  sessionInfo(probeId) {
    return this.sessions.get(probeId)?.info() || null;
  }

  // Runs one connectivity round on a remote probe. Resolves with { mihomoReady, results }.
  async runCheck(probeId, { timeout, retries, url, concurrency }) {
    const session = this.sessions.get(probeId);
    if (!session) throw new Error('Probe is not connected');
    const rounds = Math.ceil(Math.max(1, this.nodes.length) / Math.max(1, concurrency));
    const budget = rounds * (timeout + 1000) * (retries + 1) + 30000;
    return session.request({ t: 'check', timeout, retries, url: url || null, concurrency }, budget);
  }

  async runMedia(probeId, nodeIds, onItem) {
    const session = this.sessions.get(probeId);
    if (!session) throw new Error('Probe is not connected');
    return session.request({ t: 'media', nodeIds }, Math.max(1, nodeIds.length) * 90000 + 30000, onItem);
  }
}

module.exports = { ProbeHub, wireNode, HEARTBEAT_MS, IDLE_TIMEOUT_MS };
