// miaospeed wire protocol (github.com/AirportR/miaospeed): request construction, signing, the
// reverse-connection handshake (msr-v1) and decoding of results.
//
// A request is signed over its JSON re-serialization on the server, so the client must produce
// exactly the bytes Go's json-iterator would: struct field order, every field present (no
// omitempty), Go's string escaping. Do not reorder the objects built here.
const crypto = require('crypto');

// Build token baked into the official AirportR/miaospeed release binaries (published in its README).
// Self-compiled backends may use another one; it is configurable per backend.
const PUBLIC_BUILD_TOKEN = 'MIAOKO4|580JxAo049R|GEnERAl|1X571R930|T0kEN';
const API_VERSION = 3;
const REVERSE_PROTOCOL = 'msr-v1';

const MATRIX = {
  RTT: 'TEST_PING_RTT',
  HTTP: 'TEST_PING_CONN',
  UDP: 'UDP_TYPE',
  SPEED_AVG: 'SPEED_AVERAGE',
  SPEED_MAX: 'SPEED_MAX',
  SPEED_SERIES: 'SPEED_PER_SECOND',
  // Upload matrices only produce data on backends started with -upload.
  USPEED_AVG: 'USPEED_AVERAGE',
  USPEED_MAX: 'USPEED_MAX',
  USPEED_SERIES: 'USPEED_PER_SECOND',
  GEO_IN: 'GEOIP_INBOUND',
  GEO_OUT: 'GEOIP_OUTBOUND',
  SCRIPT: 'TEST_SCRIPT'
};

// The server never applies SlaveRequestConfigsV1.Check(), so the client always sends complete
// configs. Values mirror miaospeed's preconfigs/network.go.
const DEFAULT_CONFIGS = {
  stunUrl: 'udp://stunserver2025.stunprotocol.org:3478',
  downloadUrl: 'DYNAMIC:INTL',
  downloadDuration: 3,
  downloadThreading: 1,
  pingAverageOver: 1,
  pingAddress: 'http://www.gstatic.com/generate_204',
  taskRetry: 3,
  taskTimeout: 5000
};

const HEX = '0123456789abcdef';

// json-iterator ConfigDefault (EscapeHTML) string encoding.
function goString(value) {
  const text = String(value);
  const s = typeof text.toWellFormed === 'function' ? text.toWellFormed() : text;
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || ch === '<' || ch === '>' || ch === '&') out += `\\u00${HEX[code >> 4]}${HEX[code & 0xf]}`;
    else if (code === 0x2028 || code === 0x2029) out += `\\u202${HEX[code & 0xf]}`;
    else out += ch;
  }
  return `${out}"`;
}

function goJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return goString(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`Cannot sign the non-integer value ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(goJSON).join(',')}]`;
  return `{${Object.entries(value).map(([key, item]) => `${goString(key)}:${goJSON(item)}`).join(',')}}`;
}

// utils/challenge.go hashMiaoSpeed: a running SHA-512 that absorbs each token segment together with
// the digest so far; base64 with the URL alphabet and padding.
function hashMiaoSpeed(token, payload, buildToken = PUBLIC_BUILD_TOKEN) {
  const hasher = crypto.createHash('sha512');
  hasher.update(payload);
  for (let segment of [String(token ?? ''), ...String(buildToken || PUBLIC_BUILD_TOKEN).trim().split('|')]) {
    if (!segment) segment = 'SOME_TOKEN';
    hasher.update(Buffer.concat([Buffer.from(segment), hasher.copy().digest()]));
  }
  return hasher.digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

function normalizeConfigs(input = {}) {
  return {
    stunUrl: input.stunUrl || DEFAULT_CONFIGS.stunUrl,
    downloadUrl: input.downloadUrl || DEFAULT_CONFIGS.downloadUrl,
    downloadDuration: clamp(input.downloadDuration, 1, 30, DEFAULT_CONFIGS.downloadDuration),
    downloadThreading: clamp(input.downloadThreading, 1, 32, DEFAULT_CONFIGS.downloadThreading),
    // Left empty unless a task uploads (miaospeed ignores them then); same ranges as download.
    uploadUrl: input.uploadUrl ? String(input.uploadUrl) : '',
    uploadDuration: clamp(input.uploadDuration, 1, 30, 0),
    uploadThreading: clamp(input.uploadThreading, 1, 32, 0),
    pingAverageOver: clamp(input.pingAverageOver, 1, 16, DEFAULT_CONFIGS.pingAverageOver),
    pingAddress: input.pingAddress || DEFAULT_CONFIGS.pingAddress,
    taskRetry: clamp(input.taskRetry, 1, 10, DEFAULT_CONFIGS.taskRetry),
    taskTimeout: clamp(input.taskTimeout, 10, 10000, DEFAULT_CONFIGS.taskTimeout),
    dnsServers: Array.isArray(input.dnsServers) ? input.dnsServers.map(String) : []
  };
}

// matrices: array of matrix type strings or { type, params }.
// nodes: [{ name, payload }] where payload is the Clash/Mihomo YAML of a single proxy.
function buildRequest({ id, invoker = 'node-watcher', version = '', matrices, nodes, configs = {}, scripts = [], randomSequence }) {
  const cfg = normalizeConfigs(configs);
  return {
    Basics: { ID: String(id), Slave: '', SlaveName: '', Invoker: String(invoker), Version: String(version) },
    Options: {
      Filter: '',
      Matrices: matrices.map(entry => (typeof entry === 'string'
        ? { Type: entry, Params: '' }
        : { Type: String(entry.type), Params: String(entry.params || '') }))
    },
    Configs: {
      STUNURL: cfg.stunUrl,
      DownloadURL: cfg.downloadUrl,
      DownloadDuration: cfg.downloadDuration,
      DownloadThreading: cfg.downloadThreading,
      PingAverageOver: cfg.pingAverageOver,
      PingAddress: cfg.pingAddress,
      TaskRetry: cfg.taskRetry,
      DNSServers: cfg.dnsServers,
      TaskTimeout: cfg.taskTimeout,
      Scripts: scripts.map(script => ({
        ID: String(script.id), Type: script.type || 'media', Content: String(script.content),
        TimeoutMillis: clamp(script.timeout, 0, 600000, 0)
      })),
      ApiVersion: API_VERSION,
      UploadURL: cfg.uploadUrl,
      UploadDuration: cfg.uploadDuration,
      UploadThreading: cfg.uploadThreading
    },
    Vendor: 'Clash',
    Nodes: nodes.map(node => ({ Name: String(node.name), Payload: String(node.payload) })),
    RandomSequence: randomSequence || crypto.randomBytes(16).toString('hex'),
    Challenge: ''
  };
}

// The server verifies SlaveRequest.Clone(), which does not copy Vendor.
function signRequest(request, token, buildToken) {
  return hashMiaoSpeed(token, goJSON({ ...request, Vendor: '', Challenge: '' }), buildToken);
}

// Serialized, signed request ready to be sent as one websocket text message.
function encodeRequest(request, token, buildToken) {
  return goJSON({ ...request, Challenge: signRequest(request, token, buildToken) });
}

// --- reverse connection (msr-v1) -------------------------------------------------------------

function reverseHelloSign(token, nonce, timestamp, buildToken) {
  return hashMiaoSpeed(token, `reverse-hello|${nonce}|${timestamp}`, buildToken);
}

// Returns null when the hello is acceptable, otherwise the reason it is not.
function checkReverseHello(hello, token, { buildToken, now = Date.now(), maxSkewSeconds = 300 } = {}) {
  if (!hello || hello.Type !== 'hello') return 'expected a hello message';
  if (hello.Protocol !== REVERSE_PROTOCOL) return `unsupported reverse protocol ${String(hello.Protocol).slice(0, 20)}`;
  const timestamp = Number(hello.Timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > maxSkewSeconds) {
    return 'clock skew too large (check the time on the backend)';
  }
  const expected = reverseHelloSign(token, String(hello.Nonce || ''), timestamp, buildToken);
  const actual = String(hello.Sign || '');
  const ok = actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  return ok ? null : 'signature mismatch (check the token on both sides)';
}

function buildReverseAck(hello, token, { buildToken, name = 'node-watcher', version = '', sessionId = '', heartbeat = 0, pool = 0 } = {}) {
  return {
    Type: 'ack', Protocol: REVERSE_PROTOCOL, Sign: hashMiaoSpeed(token, String(hello.Sign), buildToken),
    Version: String(version), Name: name, Timestamp: Math.floor(Date.now() / 1000), SessionID: sessionId,
    Heartbeat: heartbeat, MaxTasks: 1, Pool: pool, Control: false, Error: ''
  };
}

function buildReverseError(message) {
  return { Type: 'error', Protocol: REVERSE_PROTOCOL, Error: String(message).slice(0, 200) };
}

// --- results ---------------------------------------------------------------------------------

function parsePayload(raw) {
  if (typeof raw !== 'string') return raw ?? null;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

const nonNegative = value => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null);
const series = data => (Array.isArray(data?.Speeds) ? data.Speeds.map(item => nonNegative(item) || 0) : []);

function geoInfo(info) {
  if (!info || !info.ip) return null;
  return {
    ip: String(info.ip), country: info.country || '', countryCode: String(info.country_code || '').toUpperCase(),
    asn: Number(info.asn) || null, org: info.asn_organization || info.organization || info.isp || '',
    isp: info.isp || ''
  };
}

function geoStacks(value) {
  if (!value || typeof value !== 'object') return null;
  const v4 = (value.IPv4Stack || []).map(geoInfo).filter(Boolean);
  const v6 = (value.IPv6Stack || []).map(geoInfo).filter(Boolean);
  const main = v4[0] || v6[0] || geoInfo(value.MainStack);
  if (!main) return null;
  return { main, v4, v6, stack: `${v4.length ? '4' : ''}${v6.length ? '6' : ''}` };
}

// One SlaveEntrySlot -> a flat result. Latency 0 and speed 0 mean "failed" in miaospeed.
function decodeSlot(slot) {
  const result = {
    name: slot?.ProxyInfo?.Name || '', address: slot?.ProxyInfo?.Address || '', type: slot?.ProxyInfo?.Type || '',
    durationMs: nonNegative(slot?.InvokeDuration), scripts: {}
  };
  for (const matrix of slot?.Matrices || []) {
    const data = parsePayload(matrix.Payload);
    switch (matrix.Type) {
      case MATRIX.RTT: result.rtt = nonNegative(data?.Value); break;
      case MATRIX.HTTP: result.http = nonNegative(data?.Value); break;
      case MATRIX.UDP: result.udpType = data?.Value || null; break;
      case MATRIX.SPEED_AVG: result.avgSpeed = nonNegative(data?.Value); break;
      case MATRIX.SPEED_MAX: result.maxSpeed = nonNegative(data?.Value); break;
      case MATRIX.SPEED_SERIES: result.speeds = series(data); break;
      case MATRIX.USPEED_AVG: result.uploadAvgSpeed = nonNegative(data?.Value); break;
      case MATRIX.USPEED_MAX: result.uploadMaxSpeed = nonNegative(data?.Value); break;
      case MATRIX.USPEED_SERIES: result.uploadSpeeds = series(data); break;
      case MATRIX.GEO_IN: result.inbound = geoStacks(data); break;
      case MATRIX.GEO_OUT: result.outbound = geoStacks(data); break;
      case MATRIX.SCRIPT:
        if (data?.Key) {
          result.scripts[data.Key] = {
            text: data.Text || '', color: data.Color || '', background: data.Background || '',
            elapsedMs: nonNegative(data.TimeElapsed)
          };
        }
        break;
      default: break;
    }
  }
  return result;
}

module.exports = {
  PUBLIC_BUILD_TOKEN, API_VERSION, REVERSE_PROTOCOL, MATRIX, DEFAULT_CONFIGS,
  goJSON, hashMiaoSpeed, normalizeConfigs, buildRequest, signRequest, encodeRequest,
  reverseHelloSign, checkReverseHello, buildReverseAck, buildReverseError, decodeSlot
};
