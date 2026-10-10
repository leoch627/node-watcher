// Runs one miaospeed task over an open websocket (ws package). The same code serves forward
// connections (we dialed the backend) and reverse sessions (the backend dialed us).
const crypto = require('crypto');
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

// Opens a forward connection. With `fingerprint`, the server certificate is pinned instead of being
// validated against public CAs (for backends using miaospeed's own or a self-signed certificate).
function connect(url, { fingerprint = null, timeoutMs = 10000 } = {}) {
  const pinned = normalizeFingerprint(fingerprint);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      handshakeTimeout: timeoutMs, perMessageDeflate: false, maxPayload: 64 * 1024 * 1024,
      ...(pinned ? { rejectUnauthorized: false } : {})
    });
    let verified = !pinned;
    socket.once('upgrade', response => {
      if (!pinned) return;
      const peer = response.socket?.getPeerX509Certificate?.();
      const actual = peer ? normalizeFingerprint(peer.fingerprint256) : null;
      if (actual === pinned) verified = true;
      else socket.terminate();
    });
    socket.once('open', () => {
      if (verified) resolve(socket);
      else reject(new Error('the backend certificate does not match the pinned fingerprint'));
    });
    socket.once('error', error => reject(new Error(`cannot reach the miaospeed backend: ${error.message}`)));
    socket.once('close', () => { if (!verified) reject(new Error('the backend certificate does not match the pinned fingerprint')); });
  });
}

module.exports = { runOnSocket, connect, normalizeFingerprint, TaskError };
