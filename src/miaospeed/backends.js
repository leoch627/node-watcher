// miaospeed backends ("probes"): where tests run.
//  - local:   the master's own miaospeed child process (LocalMiaospeed)
//  - forward: a miaospeed server we dial (ws:// or wss://, token, optional build token / pinned cert)
//  - reverse: a miaospeed started with `-connect <master>/miaospeed/reverse/<id>` that dials us (msr-v1)
// Records live in config.miaospeed.backends; tokens are never returned by list().
const crypto = require('crypto');
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { LocalMiaospeed } = require('./local');
const { runOnSocket, connect, normalizeFingerprint } = require('./session');
const { checkReverseHello, buildReverseAck, buildReverseError } = require('./protocol');
const { version: APP_VERSION } = require('../../package.json');

const LOCAL_ID = 'local';
const REVERSE_PREFIX = '/miaospeed/reverse/';
const HELLO_TIMEOUT_MS = 10000;
const SESSION_IDLE_MS = 120000;
const ACQUIRE_TIMEOUT_MS = 60000;
const NONCE_TTL_MS = 15 * 60 * 1000;
const REVERSE_POOL = 2;
const FORWARD_CHECK_MS = 120000;

const cleanName = value => String(value || '').trim().slice(0, 40);

class BackendManager extends EventEmitter {
  constructor({ store = config, local = new LocalMiaospeed(), localName = process.env.LOCAL_PROBE_NAME || '本机' } = {}) {
    super();
    this.store = store;
    this.local = local;
    this.localName = localName;
    this.reverse = new Map(); // backend id -> Set<session>
    this.waiters = new Map(); // backend id -> [resolve]
    this.nonces = new Map(); // `${id}:${nonce}` -> expiry
    this.forwardState = new Map(); // backend id -> { online, version, checkedAt, error }
    this.lastSeen = new Map();
    this.wss = new WebSocket.WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024, perMessageDeflate: false });
    this.timer = null;
  }

  // --- records ---------------------------------------------------------------------------------

  records() {
    const cfg = this.store.getConfig();
    if (!cfg.miaospeed || typeof cfg.miaospeed !== 'object') cfg.miaospeed = {};
    if (!Array.isArray(cfg.miaospeed.backends)) cfg.miaospeed.backends = [];
    return cfg.miaospeed.backends;
  }

  find(id) {
    return this.records().find(item => item.id === id) || null;
  }

  commit(apply, undo) {
    apply();
    if (this.store.saveConfig()) return;
    undo();
    throw new Error('Could not save configuration');
  }

  create({ name, type, url, token, buildToken, fingerprint } = {}) {
    const clean = cleanName(name);
    if (!clean) throw new Error('Backend name is required');
    if (!['forward', 'reverse'].includes(type)) throw new Error('Backend type must be forward or reverse');
    const record = { id: `m-${crypto.randomBytes(4).toString('hex')}`, name: clean, type, enabled: true, createdAt: new Date().toISOString() };
    if (type === 'forward') {
      Object.assign(record, this.validateForward({ url, token, buildToken, fingerprint }));
    } else {
      record.token = crypto.randomBytes(24).toString('base64url');
      if (buildToken) record.buildToken = String(buildToken).trim();
    }
    const records = this.records();
    this.commit(() => records.push(record), () => records.splice(records.indexOf(record), 1));
    if (type === 'forward') this.checkForward(record).catch(() => {});
    return record;
  }

  validateForward({ url, token, buildToken, fingerprint }) {
    let parsed;
    try { parsed = new URL(String(url || '').trim()); } catch (_) { throw new Error('Invalid backend URL'); }
    if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error('Backend URL must start with ws:// or wss://');
    if (!String(token || '')) throw new Error('Backend token is required');
    const pinned = fingerprint ? normalizeFingerprint(fingerprint) : null;
    if (fingerprint && !pinned) throw new Error('Invalid certificate fingerprint (expected 64 hex characters)');
    return {
      url: parsed.toString(), token: String(token),
      ...(buildToken ? { buildToken: String(buildToken).trim() } : {}),
      ...(pinned ? { fingerprint: pinned } : {})
    };
  }

  update(id, patch = {}) {
    const record = this.find(id);
    if (!record) return null;
    const previous = { ...record };
    this.commit(() => {
      if (typeof patch.name === 'string' && cleanName(patch.name)) record.name = cleanName(patch.name);
      if (typeof patch.enabled === 'boolean') record.enabled = patch.enabled;
      if (record.type === 'forward' && (patch.url || patch.token || patch.fingerprint !== undefined || patch.buildToken !== undefined)) {
        const next = this.validateForward({
          url: patch.url || record.url, token: patch.token || record.token,
          buildToken: patch.buildToken ?? record.buildToken, fingerprint: patch.fingerprint ?? record.fingerprint
        });
        delete record.buildToken;
        delete record.fingerprint;
        Object.assign(record, next);
      }
    }, () => { for (const key of Object.keys(record)) delete record[key]; Object.assign(record, previous); });
    if (record.enabled === false) this.dropSessions(id, 'backend disabled');
    if (record.type === 'forward') this.checkForward(record).catch(() => {});
    return record;
  }

  rotateToken(id) {
    const record = this.find(id);
    if (!record || record.type !== 'reverse') return null;
    const previous = record.token;
    const token = crypto.randomBytes(24).toString('base64url');
    this.commit(() => { record.token = token; }, () => { record.token = previous; });
    this.dropSessions(id, 'token rotated');
    return record;
  }

  remove(id) {
    const records = this.records();
    const index = records.findIndex(item => item.id === id);
    if (index < 0) return false;
    const record = records[index];
    this.commit(() => records.splice(index, 1), () => records.splice(index, 0, record));
    this.dropSessions(id, 'backend removed');
    this.forwardState.delete(id);
    return true;
  }

  // --- status ----------------------------------------------------------------------------------

  list() {
    const items = [];
    if (this.local.enabled) {
      const status = this.local.status();
      items.push({ id: LOCAL_ID, name: this.localName, type: 'local', enabled: true,
        online: status.ready, version: status.version, error: status.error, busy: 0, sessions: status.ready ? 1 : 0 });
    }
    for (const record of this.records()) {
      const base = { id: record.id, name: record.name, type: record.type, enabled: record.enabled !== false, createdAt: record.createdAt };
      if (record.type === 'forward') {
        const state = this.forwardState.get(record.id) || {};
        items.push({ ...base, url: record.url, pinned: Boolean(record.fingerprint), customBuildToken: Boolean(record.buildToken),
          online: state.online ?? null, version: state.version || null, error: state.error || null, checkedAt: state.checkedAt || null });
      } else {
        const sessions = [...(this.reverse.get(record.id) || [])];
        items.push({ ...base, customBuildToken: Boolean(record.buildToken), online: sessions.length > 0,
          sessions: sessions.length, busy: sessions.filter(item => item.busy).length,
          version: sessions[0]?.version || null, remote: sessions[0]?.remote || null,
          lastSeen: sessions.length ? new Date().toISOString() : this.lastSeen.get(record.id) || null });
      }
    }
    return items;
  }

  get(id) {
    return this.list().find(item => item.id === id) || null;
  }

  // Backends that can take a task right now (enabled and online / reachable).
  available() {
    return this.list().filter(item => item.enabled && item.online !== false && (item.type !== 'reverse' || item.online));
  }

  async checkForward(record) {
    const state = { checkedAt: new Date().toISOString() };
    try {
      const socket = await connect(record.url, { fingerprint: record.fingerprint });
      socket.close();
      Object.assign(state, { online: true });
    } catch (error) {
      Object.assign(state, { online: false, error: error.message });
    }
    this.forwardState.set(record.id, { ...this.forwardState.get(record.id), ...state });
    return state;
  }

  start() {
    const tick = () => {
      for (const record of this.records()) {
        if (record.type === 'forward' && record.enabled !== false) this.checkForward(record).catch(() => {});
      }
      const now = Date.now();
      for (const [key, expiry] of this.nonces) if (expiry < now) this.nonces.delete(key);
      for (const sessions of this.reverse.values()) {
        for (const session of sessions) {
          if (now - session.lastSeen > SESSION_IDLE_MS) session.socket.terminate();
        }
      }
    };
    tick();
    this.timer = setInterval(tick, FORWARD_CHECK_MS);
    this.timer.unref?.();
    return this.local.start().catch(error => logger.error(`Local miaospeed failed to start: ${error.message}`));
  }

  async stop() {
    clearInterval(this.timer);
    for (const id of this.reverse.keys()) this.dropSessions(id, 'master shutting down');
    await this.local.shutdown();
  }

  // --- running tasks ---------------------------------------------------------------------------

  // request: protocol.buildRequest arguments without id. Resolves { version, results }.
  async runTask(id, request, { onProgress, signal, timeoutMs } = {}) {
    if (id === LOCAL_ID) {
      if (!this.local.ready) throw new Error(`本机 miaospeed 未就绪${this.local.error ? `：${this.local.error}` : ''}`);
      const socket = await connect(this.local.url);
      try {
        return await runOnSocket(socket, { token: this.local.token, request, onProgress, signal, timeoutMs });
      } finally {
        socket.close();
      }
    }
    const record = this.find(id);
    if (!record) throw new Error('Unknown miaospeed backend');
    if (record.enabled === false) throw new Error(`后端 ${record.name} 已停用`);
    if (record.type === 'forward') {
      const socket = await connect(record.url, { fingerprint: record.fingerprint });
      this.forwardState.set(id, { ...this.forwardState.get(id), online: true, error: null, checkedAt: new Date().toISOString() });
      try {
        const outcome = await runOnSocket(socket, { token: record.token, buildToken: record.buildToken, request, onProgress, signal, timeoutMs });
        this.forwardState.set(id, { ...this.forwardState.get(id), version: outcome.version });
        return outcome;
      } finally {
        socket.close();
      }
    }
    const session = await this.acquire(id, signal);
    try {
      return await runOnSocket(session.socket, { token: record.token, buildToken: record.buildToken, request, onProgress, signal, timeoutMs });
    } finally {
      this.release(session);
    }
  }

  acquire(id, signal) {
    const idle = [...(this.reverse.get(id) || [])].find(item => !item.busy);
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    const record = this.find(id);
    if (!this.reverse.get(id)?.size) {
      return Promise.reject(new Error(`后端 ${record?.name || id} 未连接（反向连接尚未建立）`));
    }
    return new Promise((resolve, reject) => {
      const queue = this.waiters.get(id) || [];
      this.waiters.set(id, queue);
      const settle = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
      };
      const entry = {
        grant: session => { settle(); session.busy = true; resolve(session); },
        fail: message => { settle(); reject(new Error(message)); }
      };
      const timer = setTimeout(() => entry.fail(`后端 ${record?.name || id} 忙，等待超时`), ACQUIRE_TIMEOUT_MS);
      const onAbort = () => entry.fail('cancelled');
      signal?.addEventListener('abort', onAbort, { once: true });
      queue.push(entry);
    });
  }

  release(session) {
    session.busy = false;
    if (session.closed) return;
    this.waiters.get(session.backendId)?.[0]?.grant(session);
  }

  dropSessions(id, reason) {
    for (const session of this.reverse.get(id) || []) {
      try { session.socket.close(1000, reason); } catch (_) { /* gone */ }
      session.socket.terminate();
    }
  }

  // --- reverse endpoint ------------------------------------------------------------------------

  isReversePath(url) {
    return String(url || '').startsWith(REVERSE_PREFIX);
  }

  // http(s) 'upgrade' handler. Returns false when the request is not for us.
  handleUpgrade(req, socket, head) {
    const pathname = String(req.url || '').split('?')[0];
    if (!pathname.startsWith(REVERSE_PREFIX)) return false;
    const id = decodeURIComponent(pathname.slice(REVERSE_PREFIX.length));
    const record = this.find(id);
    if (!record || record.type !== 'reverse' || record.enabled === false) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return true;
    }
    this.wss.handleUpgrade(req, socket, head, ws => this.acceptReverse(ws, record, req));
    return true;
  }

  acceptReverse(ws, record, req) {
    const remote = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const timer = setTimeout(() => ws.terminate(), HELLO_TIMEOUT_MS);
    ws.once('message', raw => {
      clearTimeout(timer);
      let hello;
      try { hello = JSON.parse(String(raw)); } catch (_) { hello = null; }
      const reject = reason => {
        logger.warn(`miaospeed reverse link for ${record.name} from ${remote} rejected: ${reason}`);
        try { ws.send(JSON.stringify(buildReverseError(reason)), () => ws.close()); } catch (_) { ws.terminate(); }
      };
      const current = this.find(record.id);
      if (!current || current.enabled === false) return reject('backend disabled');
      const problem = checkReverseHello(hello, current.token, { buildToken: current.buildToken });
      if (problem) return reject(problem);
      const nonceKey = `${record.id}:${hello.Nonce}`;
      if (this.nonces.has(nonceKey)) return reject('replayed handshake');
      this.nonces.set(nonceKey, Date.now() + NONCE_TTL_MS);
      if (hello.Role === 'control') return reject('control links are not supported');
      const session = {
        backendId: record.id, socket: ws, remote, version: String(hello.Version || '').slice(0, 40),
        busy: false, closed: false, lastSeen: Date.now(), sessionId: crypto.randomUUID()
      };
      ws.send(JSON.stringify(buildReverseAck(hello, current.token, {
        buildToken: current.buildToken, version: APP_VERSION, sessionId: session.sessionId, pool: REVERSE_POOL
      })));
      const sessions = this.reverse.get(record.id) || new Set();
      this.reverse.set(record.id, sessions);
      const wasOffline = sessions.size === 0;
      sessions.add(session);
      ws.on('ping', () => { session.lastSeen = Date.now(); });
      ws.on('message', () => { session.lastSeen = Date.now(); });
      ws.on('close', () => {
        session.closed = true;
        sessions.delete(session);
        this.lastSeen.set(record.id, new Date().toISOString());
        if (sessions.size === 0) {
          logger.warn(`miaospeed backend ${record.name} disconnected`);
          for (const waiter of [...(this.waiters.get(record.id) || [])]) waiter.fail(`后端 ${record.name} 已断开`);
          this.emit('disconnect', { id: record.id, name: record.name });
        }
      });
      ws.on('error', () => {});
      if (wasOffline) {
        logger.info(`miaospeed backend ${record.name} connected from ${remote} (${session.version || 'unknown version'})`);
        this.emit('connect', { id: record.id, name: record.name });
      }
      this.waiters.get(record.id)?.[0]?.grant(session);
    });
    ws.on('error', () => {});
  }
}

const manager = new BackendManager();
module.exports = manager;
module.exports.BackendManager = BackendManager;
module.exports.LOCAL_ID = LOCAL_ID;
module.exports.REVERSE_PREFIX = REVERSE_PREFIX;
