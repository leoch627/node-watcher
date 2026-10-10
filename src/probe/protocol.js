// Wire protocol between the master and remote probes.
//
// Transport: TLS 1.3. Frames: 4-byte big-endian length followed by a UTF-8 JSON object with a
// string field `t` (message type). Every message is a single frame.
//
// agent -> master  hello      { v, id, token, version, hostname, mihomoReady }
// master -> agent  welcome    { probe: { id, name }, heartbeatMs }
// master -> agent  nodes      { revision, nodes: [runtime node incl. proxy] }
// agent -> master  nodesAck   { revision, mihomoReady }
// master -> agent  check      { job, timeout, retries, url, concurrency }
// agent -> master  checkResult{ job, mihomoReady, results: [{ id, online, latency, error, skipped }] }
// master -> agent  media      { job, nodeIds }
// agent -> master  mediaItem  { job, nodeId, media }   (one per node)
// agent -> master  mediaDone  { job, errors, error? }
// either           ping/pong  { ts }
// agent -> master  status     { mihomoReady }
// either           error      { message } (then the sender closes the connection)

const PROTOCOL_VERSION = 1;
const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_HELLO_BYTES = 64 * 1024;
const DEFAULT_PORT = 7443;

function encode(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME_BYTES) throw new Error(`Frame too large (${body.length} bytes)`);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

class FrameDecoder {
  constructor(maxFrameBytes = MAX_FRAME_BYTES) {
    this.maxFrameBytes = maxFrameBytes;
    this.buffer = Buffer.alloc(0);
  }

  // Returns the complete messages contained in the data received so far. Throws on a protocol
  // violation (oversized frame, invalid JSON, message without a type); the caller must then close.
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length > this.maxFrameBytes) throw new Error(`Frame too large (${length} bytes)`);
      if (this.buffer.length < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      let message;
      try {
        message = JSON.parse(body.toString('utf8'));
      } catch (_) {
        throw new Error('Invalid frame payload');
      }
      if (!message || typeof message !== 'object' || typeof message.t !== 'string') {
        throw new Error('Frame without a message type');
      }
      messages.push(message);
    }
    return messages;
  }
}

function normalizeFingerprint(value) {
  const hex = String(value || '').replace(/^sha256[:=]/i, '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  return hex.length === 64 ? hex : null;
}

// nwp://<probeId>:<token>@<host>:<port>?fp=<sha256 hex of the master certificate>
function formatJoin({ id, token, host, port = DEFAULT_PORT, fingerprint }) {
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const query = fingerprint ? `?fp=${normalizeFingerprint(fingerprint)}` : '';
  return `nwp://${encodeURIComponent(id)}:${encodeURIComponent(token)}@${hostPart}:${port}${query}`;
}

function parseJoin(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch (_) {
    throw new Error('Invalid join string');
  }
  if (url.protocol !== 'nwp:') throw new Error('Join string must start with nwp://');
  const id = decodeURIComponent(url.username);
  const token = decodeURIComponent(url.password);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!id || !token || !host) throw new Error('Join string is missing the probe id, token or host');
  const fp = url.searchParams.get('fp');
  const fingerprint = fp ? normalizeFingerprint(fp) : null;
  if (fp && !fingerprint) throw new Error('Invalid certificate fingerprint in join string');
  return { id, token, host, port: Number(url.port) || DEFAULT_PORT, fingerprint };
}

module.exports = {
  PROTOCOL_VERSION, MAX_FRAME_BYTES, MAX_HELLO_BYTES, DEFAULT_PORT,
  encode, FrameDecoder, normalizeFingerprint, formatJoin, parseJoin
};
