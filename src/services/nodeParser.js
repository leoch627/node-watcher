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

function stableHash(value, length = 12) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function toRuntimeNode(proxy, source) {
  const normalized = normalizeClashProxy(proxy);
  if (!normalized) return null;
  const fingerprint = JSON.stringify({ sourceId: source.id, type: normalized.type, server: normalized.server,
    port: normalized.port, uuid: normalized.uuid, password: normalized.password, name: normalized.name });
  const id = stableHash(fingerprint);
  const displayName = normalized.name;
  const proxyName = `${displayName} · ${id.slice(0, 6)}`;
  return {
    id, name: displayName, proxyName, protocol: normalized.type, server: normalized.server,
    address: normalized.server, port: normalized.port, subscription: source.name,
    source: { id: source.id, name: source.name, type: source.type },
    proxy: { ...normalized, name: proxyName }
  };
}

module.exports = { SUPPORTED_PROTOCOLS, decodeBase64, normalizeClashProxy, parseContent, parseUri, toRuntimeNode };
