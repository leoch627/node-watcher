// Runs one miaospeed task over an open websocket (ws package). The same code serves forward
// connections (we dialed the backend) and reverse sessions (the backend dialed us).
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const WebSocket = require('ws');
const { encodeRequest, buildRequest, decodeSlot } = require('./protocol');

class TaskError extends Error {
  constructor(message, { aborted = false } = {}) {
    super(message);
    this.aborted = aborted;
  }
}

// request: arguments for protocol.buildRequest (id is generated when missing).
// Resolves { version, results: [decoded slot + raw index] } once the backend reports the result.
function runOnSocket(socket, { token, buildToken, request, onProgress, signal, timeoutMs = 10 * 60 * 1000 }) {
  const built = buildRequest({ id: crypto.randomUUID(), ...request });
  const payload = encodeRequest(built, token, buildToken);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('close', onClose);
      socket.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(value);
    };
    // A closed connection is the only way to stop a task: miaospeed aborts the tasks of a dropped link.
    const abort = reason => {
      finish(new TaskError(reason, { aborted: true }));
      try { socket.terminate(); } catch (_) { /* already gone */ }
    };
    const timer = setTimeout(() => abort(`miaospeed task timed out after ${Math.round(timeoutMs / 1000)}s`), timeoutMs);
    timer.unref?.();
    const onAbort = () => abort('cancelled');
    const onClose = () => finish(new TaskError('connection to the miaospeed backend closed before the result'));
    const onError = error => finish(new TaskError(`miaospeed connection error: ${error.message}`));
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(String(raw)); } catch (_) { return; }
      if (message.Error) return finish(new TaskError(`miaospeed: ${message.Error}`));
      // ApiV2+ backends first send a queue-position message whose record is empty.
      const record = message.Progress?.Record;
      if (record?.ProxyInfo?.Name && onProgress) {
        try { onProgress({ index: message.Progress.Index, queuing: message.Progress.Queuing, result: decodeSlot(record) }); } catch (_) { /* caller bug must not kill the task */ }
      } else if (message.Progress && !record?.ProxyInfo?.Name && onProgress) {
        try { onProgress({ queuing: message.Progress.Queuing, result: null }); } catch (_) { /* ignore */ }
      }
      if (message.Result) {
        finish(null, {
          version: message.MiaoSpeedVersion || '',
          results: (message.Result.Results || []).map(decodeSlot)
        });
      }
    };
    if (signal?.aborted) return abort('cancelled');
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.on('message', onMessage);
    socket.on('close', onClose);
    socket.on('error', onError);
    try {
      socket.send(payload, error => { if (error) finish(new TaskError(`could not send the task: ${error.message}`)); });
    } catch (error) {
      finish(new TaskError(`could not send the task: ${error.message}`));
    }
  });
}

function normalizeFingerprint(value) {
  const hex = String(value || '').replace(/^sha256[:=]/i, '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  return hex.length === 64 ? hex : null;
}

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

// Checks the TLS material of a forward backend and returns the fields to store (empty ones left out):
//  - ca: PEM certificate(s) the backend's server certificate must chain to, instead of public CAs
//    (for miaospeed -mtls with -serverpublickey signed by your own CA);
//  - clientCert / clientKey: presented to the backend, which verifies them against its -clientca;
//  - servername: the name the server certificate is checked against when it differs from the URL host.
function validateTls({ ca, clientCert, clientKey, servername } = {}) {
  const out = {};
  const caText = String(ca || '').trim();
  if (caText) {
    const blocks = caText.match(PEM_CERT) || [];
    if (!blocks.length) throw new Error('CA 证书不是 PEM 格式');
    for (const block of blocks) {
      try { new crypto.X509Certificate(block); } catch (_) { throw new Error('CA 证书无法解析'); }
    }
    out.ca = blocks.join('\n');
  }
  const certText = String(clientCert || '').trim();
  const keyText = String(clientKey || '').trim();
  if (Boolean(certText) !== Boolean(keyText)) throw new Error('客户端证书和私钥需要同时提供');
  if (certText) {
    const blocks = certText.match(PEM_CERT) || [];
    if (!blocks.length) throw new Error('客户端证书不是 PEM 格式');
    let leaf;
    let key;
    try { leaf = new crypto.X509Certificate(blocks[0]); } catch (_) { throw new Error('客户端证书无法解析'); }
    try { key = crypto.createPrivateKey(keyText); } catch (_) { throw new Error('客户端私钥无法解析（需要未加密的 PEM）'); }
    if (!leaf.checkPrivateKey(key)) throw new Error('客户端私钥与证书不匹配');
    out.clientCert = blocks.join('\n');
    out.clientKey = key.export({ type: 'pkcs8', format: 'pem' });
  }
  const name = String(servername || '').trim();
  if (name) {
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(name)) throw new Error('证书域名格式不正确');
    out.servername = name;
  }
  return out;
}

// connect() options from a stored forward backend record.
function tlsOptions(record = {}) {
  return {
    fingerprint: record.fingerprint || null, ca: record.ca || null, cert: record.clientCert || null,
    key: record.clientKey || null, servername: record.servername || null
  };
}

// Opens a forward connection. With `fingerprint`, the server certificate is pinned instead of being
// validated (for backends using miaospeed's embedded or a self-signed certificate); with `ca` it must
// chain to that CA. `cert` / `key` are sent as the client certificate for miaospeed's -clientca.
function connect(url, { fingerprint = null, ca = null, cert = null, key = null, servername = null, timeoutMs = 10000 } = {}) {
  const pinned = normalizeFingerprint(fingerprint);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      handshakeTimeout: timeoutMs, perMessageDeflate: false, maxPayload: 64 * 1024 * 1024,
      ...(pinned ? { rejectUnauthorized: false } : {}),
      ...(ca ? { ca } : {}),
      ...(cert && key ? { cert, key } : {}),
      ...(servername ? { servername } : {})
    });
    const mismatch = () => new Error('the backend certificate does not match the pinned fingerprint');
    let verified = !pinned;
    let refused = false;
    socket.once('upgrade', response => {
      if (!pinned) return;
      const peer = response.socket?.getPeerX509Certificate?.();
      const actual = peer ? normalizeFingerprint(peer.fingerprint256) : null;
      if (actual === pinned) verified = true;
      else { refused = true; socket.terminate(); }
    });
    socket.once('open', () => {
      if (verified) resolve(socket);
      else reject(mismatch());
    });
    socket.once('error', error => reject(refused ? mismatch() : new Error(`cannot reach the miaospeed backend: ${error.message}`)));
    socket.once('close', () => { if (!verified) reject(mismatch()); });
  });
}

// Reads the certificate a wss:// backend presents, without trusting it, so it can be shown to the
// admin and pinned (miaospeed -mtls serves certificates no public CA signed).
function peekCertificate(url, { servername = null, timeoutMs = 8000 } = {}) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (_) { return Promise.reject(new Error('Invalid backend URL')); }
  if (parsed.protocol !== 'wss:') return Promise.reject(new Error('只有 wss:// 后端有证书'));
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const sni = servername || (net.isIP(host) ? undefined : host);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: Number(parsed.port) || 443, servername: sni, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const peer = socket.getPeerX509Certificate();
      const authorized = socket.authorized;
      const reason = socket.authorizationError ? String(socket.authorizationError) : null;
      socket.end();
      if (!peer) return reject(new Error('the backend presented no certificate'));
      resolve({
        fingerprint: normalizeFingerprint(peer.fingerprint256), subject: peer.subject, issuer: peer.issuer,
        subjectAltName: peer.subjectAltName || null, validFrom: peer.validFrom, validTo: peer.validTo,
        trusted: authorized, reason
      });
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('timed out')); });
    socket.once('error', error => reject(new Error(`cannot reach the miaospeed backend: ${error.message}`)));
  });
}

module.exports = { runOnSocket, connect, peekCertificate, normalizeFingerprint, validateTls, tlsOptions, TaskError };
