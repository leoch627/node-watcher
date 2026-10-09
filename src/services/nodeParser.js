const crypto = require('crypto');
const YAML = require('js-yaml');

const SUPPORTED_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'ss', 'hysteria2', 'tuic']);

function decodeBase64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function decodeName(value, fallback) {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value.replace(/^#/, '')) || fallback;
  } catch (_) {
    return value.replace(/^#/, '') || fallback;
  }
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function withoutEmpty(value) {
  if (Array.isArray(value)) return value.map(withoutEmpty);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, withoutEmpty(item)])
  );
}

function parseTransport(proxy, params) {
  const network = params.get('type') || params.get('network') || 'tcp';
  proxy.network = network;
  if (network === 'ws') {
    proxy['ws-opts'] = withoutEmpty({
      path: params.get('path') || '/',
      headers: { Host: params.get('host') || undefined }
    });
  } else if (network === 'grpc') {
    proxy['grpc-opts'] = withoutEmpty({
      'grpc-service-name': params.get('serviceName') || params.get('service-name')
    });
  } else if (network === 'h2' || network === 'http') {
    proxy['h2-opts'] = withoutEmpty({
      path: params.get('path') || '/',
      host: params.get('host') ? params.get('host').split(',') : undefined
    });
  }
}

function parseVless(link) {
  const url = new URL(link);
  const params = url.searchParams;
  const security = params.get('security') || 'none';
  const proxy = {
    name: decodeName(url.hash, `${url.hostname}:${url.port}`), type: 'vless',
    server: url.hostname, port: Number(url.port), uuid: decodeURIComponent(url.username), udp: true,
    tls: security === 'tls' || security === 'reality', flow: params.get('flow') || undefined,
    servername: params.get('sni') || params.get('host') || undefined,
    'skip-cert-verify': parseBoolean(params.get('allowInsecure')),
    'client-fingerprint': params.get('fp') || undefined
  };
  if (security === 'reality') {
    proxy['reality-opts'] = withoutEmpty({
      'public-key': params.get('pbk'), 'short-id': params.get('sid')
    });
  }
  parseTransport(proxy, params);
  return withoutEmpty(proxy);
}

function parseTrojan(link) {
  const url = new URL(link);
  const params = url.searchParams;
  const proxy = {
    name: decodeName(url.hash, `${url.hostname}:${url.port}`), type: 'trojan',
    server: url.hostname, port: Number(url.port), password: decodeURIComponent(url.username), udp: true,
    sni: params.get('sni') || params.get('peer') || params.get('host') || undefined,
    'skip-cert-verify': parseBoolean(params.get('allowInsecure')),
    'client-fingerprint': params.get('fp') || undefined
  };
  parseTransport(proxy, params);
  return withoutEmpty(proxy);
}

function parseHysteria2(link) {
  const url = new URL(link.replace(/^hy2:\/\//i, 'hysteria2://'));
  const params = url.searchParams;
  return withoutEmpty({
    name: decodeName(url.hash, `${url.hostname}:${url.port}`), type: 'hysteria2',
    server: url.hostname, port: Number(url.port), password: decodeURIComponent(url.username),
    sni: params.get('sni') || params.get('peer') || undefined, obfs: params.get('obfs') || undefined,
    'obfs-password': params.get('obfs-password') || params.get('obfsParam') || undefined,
    'skip-cert-verify': parseBoolean(params.get('insecure')) || parseBoolean(params.get('allowInsecure')),
    up: params.get('upmbps') ? `${params.get('upmbps')} Mbps` : undefined,
    down: params.get('downmbps') ? `${params.get('downmbps')} Mbps` : undefined
  });
}

function parseVmess(link) {
  const payload = JSON.parse(decodeBase64(link.slice('vmess://'.length)));
  const network = payload.net || payload.type || 'tcp';
  const proxy = {
    name: payload.ps || `${payload.add}:${payload.port}`, type: 'vmess', server: payload.add,
    port: Number(payload.port), uuid: payload.id, alterId: Number(payload.aid || 0),
    cipher: payload.scy || 'auto', udp: true, network, tls: payload.tls === 'tls',
    servername: payload.sni || payload.host || undefined,
    'skip-cert-verify': parseBoolean(payload.allowInsecure), 'client-fingerprint': payload.fp || undefined
  };
  if (network === 'ws') {
    proxy['ws-opts'] = withoutEmpty({ path: payload.path || '/', headers: { Host: payload.host || undefined } });
  } else if (network === 'grpc') {
    proxy['grpc-opts'] = withoutEmpty({ 'grpc-service-name': payload.path });
  } else if (network === 'h2') {
    proxy['h2-opts'] = withoutEmpty({ path: payload.path || '/', host: payload.host?.split(',') });
  }
  return withoutEmpty(proxy);
}

function parseShadowsocks(link) {
  const raw = link.slice('ss://'.length);
  const hashIndex = raw.indexOf('#');
  const name = decodeName(hashIndex >= 0 ? raw.slice(hashIndex) : '', 'Shadowsocks');
  const bodyWithQuery = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = bodyWithQuery.indexOf('?');
  const body = queryIndex >= 0 ? bodyWithQuery.slice(0, queryIndex) : bodyWithQuery;
  const query = new URLSearchParams(queryIndex >= 0 ? bodyWithQuery.slice(queryIndex + 1) : '');
  let credentials;
  let endpoint;
  if (body.includes('@')) {
    const at = body.lastIndexOf('@');
    credentials = body.slice(0, at);
    endpoint = body.slice(at + 1);
    if (!credentials.includes(':')) credentials = decodeBase64(credentials);
  } else {
    const decoded = decodeBase64(body);
    const at = decoded.lastIndexOf('@');
    credentials = decoded.slice(0, at);
    endpoint = decoded.slice(at + 1);
  }
  const separator = credentials.indexOf(':');
  if (separator < 1) throw new Error('Invalid Shadowsocks credentials');
  const endpointUrl = new URL(`ss://${endpoint}`);
  const proxy = {
    name, type: 'ss', server: endpointUrl.hostname, port: Number(endpointUrl.port),
    cipher: decodeURIComponent(credentials.slice(0, separator)),
    password: decodeURIComponent(credentials.slice(separator + 1)), udp: true
  };
  const plugin = query.get('plugin');
  if (plugin) {
    const [pluginName, ...options] = decodeURIComponent(plugin).split(';');
    proxy.plugin = pluginName;
    proxy['plugin-opts'] = Object.fromEntries(options.map(item => {
      const [key, value = true] = item.split('=');
      return [key, value];
    }));
  }
  return withoutEmpty(proxy);
}

function parseTuic(link) {
  const url = new URL(link);
  const params = url.searchParams;
  return withoutEmpty({
    name: decodeName(url.hash, `${url.hostname}:${url.port}`), type: 'tuic',
    server: url.hostname, port: Number(url.port), uuid: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), sni: params.get('sni') || undefined,
    'skip-cert-verify': parseBoolean(params.get('allowInsecure')),
    'congestion-controller': params.get('congestion_control') || 'bbr', udp: true
  });
}

function parseUri(link) {
  const value = link.trim().replace(/^([a-z0-9]+)\\:\/\//i, '$1://');
  if (/^vless:\/\//i.test(value)) return parseVless(value);
  if (/^vmess:\/\//i.test(value)) return parseVmess(value);
  if (/^trojan:\/\//i.test(value)) return parseTrojan(value);
  if (/^ss:\/\//i.test(value)) return parseShadowsocks(value);
  if (/^(hy2|hysteria2):\/\//i.test(value)) return parseHysteria2(value);
  if (/^tuic:\/\//i.test(value)) return parseTuic(value);
  return null;
}

function normalizeClashProxy(proxy) {
  if (!proxy || typeof proxy !== 'object') return null;
  const normalized = { ...proxy, type: String(proxy.type || '').toLowerCase() };
  if (normalized.type === 'shadowsocks') normalized.type = 'ss';
  if (normalized.type === 'hy2') normalized.type = 'hysteria2';
  if (!SUPPORTED_PROTOCOLS.has(normalized.type) || !normalized.server || !Number(normalized.port)) return null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (['vmess', 'vless'].includes(normalized.type) && !uuidPattern.test(normalized.uuid || '')) return null;
  if (['trojan', 'hysteria2'].includes(normalized.type) && !normalized.password) return null;
  if (normalized.type === 'ss' && (!normalized.cipher || !normalized.password)) return null;
  if (normalized.type === 'tuic' && (!uuidPattern.test(normalized.uuid || '') || !normalized.password)) return null;
  normalized.port = Number(normalized.port);
  normalized.name = String(normalized.name || `${normalized.server}:${normalized.port}`);
  return normalized;
}

function parseContent(content) {
  if (typeof content !== 'string' || !content.trim()) return { proxies: [], errors: [], format: 'empty' };
  const value = content.replace(/^\uFEFF/, '').trim();
  try {
    const document = YAML.load(value);
    const proxies = document && (document.proxies || document.Proxy);
    if (Array.isArray(proxies)) {
      return { proxies: proxies.map(normalizeClashProxy).filter(Boolean), errors: [], format: 'clash' };
    }
  } catch (_) { /* Continue as a link list. */ }

  let decoded = value;
  const clean = value.replace(/\s/g, '');
  if (!value.includes('://') && clean.length > 16 && /^[A-Za-z0-9+/_=-]+$/.test(clean)) {
    try {
      const candidate = decodeBase64(value);
      if (candidate.includes('://')) decoded = candidate;
    } catch (_) { /* Report individual line errors below. */ }
  }
  const proxies = [];
  const errors = [];
  for (const [index, line] of decoded.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      const proxy = parseUri(trimmed);
      if (proxy) proxies.push(proxy);
      else errors.push({ line: index + 1, error: 'Unsupported node format' });
    } catch (error) {
      errors.push({ line: index + 1, error: error.message });
    }
  }
  return { proxies, errors, format: 'links' };
}

// ---- region detection -------------------------------------------------------------------------
// Airports put a flag emoji in the node name (🇯🇵 日本 01). Two regional-indicator symbols spell the ISO
// 3166-1 alpha-2 code, so the flag is decoded rather than looked up. Names without a flag fall back to
// common place names / codes.
const FLAG_PATTERN = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }); } catch (_) { /* no ICU data */ }

function isRegionCode(code) {
  if (!/^[A-Z]{2}$/.test(code)) return false;
  if (!regionNames) return true;
  try { return Boolean(regionNames.of(code)); } catch (_) { return false; }
}

function normalizeRegionCode(code) {
  return code === 'UK' ? 'GB' : code;
}

function flagToRegion(text) {
  for (const match of String(text || '').matchAll(FLAG_PATTERN)) {
    const code = [...match[0]].map(char => String.fromCharCode(char.codePointAt(0) - 0x1F1E6 + 65)).join('');
    if (isRegionCode(code)) return normalizeRegionCode(code);
  }
  return null;
}

const code2 = value => `(?<![A-Za-z])(?:${value})(?![A-Za-z])`;
const REGION_KEYWORDS = [
  ['HK', new RegExp(`香港|Hong\\s?Kong|${code2('HK')}`, 'i')],
  ['TW', new RegExp(`台湾|台灣|Taiwan|${code2('TW')}`, 'i')],
  ['MO', /澳门|澳門|Macau|Macao/i],
  ['JP', new RegExp(`日本|Japan|东京|東京|大阪|Tokyo|Osaka|${code2('JP')}`, 'i')],
  ['KR', new RegExp(`韩国|韓國|Korea|首尔|首爾|Seoul|${code2('KR')}`, 'i')],
  ['SG', new RegExp(`新加坡|狮城|Singapore|${code2('SG')}`, 'i')],
  ['US', new RegExp(`美国|美國|United\\s?States|洛杉[矶磯]|[圣聖]荷?[何西]|西雅图|纽约|芝加哥|Los\\s?Angeles|San\\s?Jose|Seattle|${code2('US|USA')}`, 'i')],
  ['GB', new RegExp(`英国|英國|United\\s?Kingdom|伦敦|倫敦|London|${code2('UK')}`, 'i')],
  ['DE', new RegExp(`德国|德國|Germany|法兰克福|Frankfurt|${code2('DE')}`, 'i')],
  ['FR', /法国|法國|France|巴黎|Paris/i],
  ['CA', /加拿大|Canada|多伦多|温哥华/i],
  ['AU', /澳大利亚|澳洲|Australia|悉尼|Sydney/i],
  ['MY', /马来西亚|Malaysia/i],
  ['TH', /泰国|泰國|Thailand|曼谷/i],
  ['VN', /越南|Vietnam/i],
  ['PH', /菲律宾|Philippines/i],
  ['ID', /印度尼西亚|印尼|Indonesia/i],
  ['IN', /印度(?!尼西亚)|India(?!n)/i],
  ['RU', /俄罗斯|俄羅斯|Russia|莫斯科/i],
  ['TR', /土耳其|Turkey|Türkiye/i],
  ['AR', /阿根廷|Argentina/i],
  ['BR', /巴西|Brazil/i],
  ['NL', /荷兰|荷蘭|Netherlands|阿姆斯特丹/i],
  ['CN', new RegExp(`中国大陆|中國大陸|中国|中國|${code2('CN')}`, 'i')]
];

// Subscription "info" entries (remaining traffic, expiry date, website...) are not real nodes.
const INFO_NAME = /剩余|到期|过期|流量|套餐|重置|官网|网址|订阅|Traffic|Expire|Reset|Website/i;

function detectRegion(name) {
  const flag = flagToRegion(name);
  if (flag) return { region: flag, regionSource: 'flag' };
  if (INFO_NAME.test(String(name || ''))) return { region: null, regionSource: null };
  for (const [region, pattern] of REGION_KEYWORDS) {
    if (pattern.test(String(name || ''))) return { region, regionSource: 'name' };
  }
  return { region: null, regionSource: null };
}

function stableHash(value, length = 12) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

// The id deliberately excludes the display name: airports rename nodes (flags, tags, traffic notes)
// all the time, and a rename must not reset the node's history or alert state.
// `seen` disambiguates entries that share the same endpoint and credentials within one source.
function toRuntimeNode(proxy, source, seen) {
  const normalized = normalizeClashProxy(proxy);
  if (!normalized) return null;
  const fingerprint = JSON.stringify({ sourceId: source.id, type: normalized.type, server: normalized.server,
    port: normalized.port, uuid: normalized.uuid, password: normalized.password });
  const occurrence = seen ? (seen.get(fingerprint) || 0) : 0;
  if (seen) seen.set(fingerprint, occurrence + 1);
  const id = stableHash(occurrence > 0 ? `${fingerprint}#${occurrence}` : fingerprint);
  const displayName = normalized.name;
  const proxyName = `${displayName} · ${id.slice(0, 6)}`;
  const { region, regionSource } = detectRegion(displayName);
  return {
    id, name: displayName, proxyName, region, regionSource, protocol: normalized.type, server: normalized.server,
    address: normalized.server, port: normalized.port, subscription: source.name,
    source: { id: source.id, name: source.name, type: source.type },
    proxy: { ...normalized, name: proxyName }
  };
}

function toRuntimeNodes(proxies, source) {
  const seen = new Map();
  return proxies.map(proxy => toRuntimeNode(proxy, source, seen)).filter(Boolean);
}

module.exports = { SUPPORTED_PROTOCOLS, decodeBase64, normalizeClashProxy, parseContent, parseUri, toRuntimeNode, toRuntimeNodes, detectRegion, flagToRegion };
