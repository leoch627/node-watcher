const axios = require('axios');
const net = require('net');
const { HttpsProxyAgent } = require('https-proxy-agent');
const mihomoService = require('./mihomo');
const regionalMedia = require('./regionalMedia');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';
const DISNEY_BROWSER_TOKEN = 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84';

function result(status, detail, region = null) {
  return { status, detail, region };
}

// ---- native vs DNS unlock --------------------------------------------------------------------
// RegionRestrictionCheck decides "Native" vs "DNS" from the *local* resolver (nslookup/dig on the box
// running the script). Through a proxy node that resolver is the node's, not ours, so we use the
// observable consequence instead: a DNS (or SNI-proxy / split-routing) unlock sends that platform's
// traffic out of a different IP than the node's normal exit. Platforms that echo the client IP:
//   Netflix title page  "requestIpAddress"   YouTube  INNERTUBE_CONTEXT "remoteHost"
//   Prime Video         "customerIPAddress"  ChatGPT  chatgpt.com/cdn-cgi/trace   KKTV  data.ip
const PLATFORM_IP_PATTERNS = [
  /"remoteHost"\s*:\s*"([^"]+)"/,
  /"requestIpAddress"\s*:\s*"([^"]+)"/,
  /customerIPAddress(?:"|&#34;)\s*:\s*(?:"|&#34;)([^"&]+)/
];

function cleanIp(value) {
  const ip = String(value || '').split(',')[0].trim();
  return net.isIP(ip) ? ip : null;
}

function extractPlatformIp(body) {
  const text = String(body || '');
  for (const pattern of PLATFORM_IP_PATTERNS) {
    const ip = cleanIp(text.match(pattern)?.[1]);
    if (ip) return ip;
  }
  return null;
}

// exitIps: the node's general exit IP sampled before and after the checks.
function classifyUnlock(platformIp, exitIps) {
  const ip = cleanIp(platformIp);
  if (!ip) return null;
  const samples = [...new Set((exitIps || []).map(cleanIp).filter(Boolean))];
  if (samples.length === 0) return null;
  if (samples.length > 1) {
    return { unlockType: null, platformIp: ip, unlockNote: `节点出口 IP 不固定（${samples.join(' / ')}），无法判断` };
  }
  const [exit] = samples;
  if (net.isIP(ip) !== net.isIP(exit)) {
    return { unlockType: null, platformIp: ip, unlockNote: `平台走 IPv${net.isIP(ip)}，出口检测为 IPv${net.isIP(exit)}，无法比较` };
  }
  return ip === exit
    ? { unlockType: 'native', platformIp: ip }
    : { unlockType: 'dns', platformIp: ip, unlockNote: `平台看到的 IP ${ip} 与节点出口 ${exit} 不同` };
}

// Adds unlockType to a service result. Only reachable services get a verdict, like the original script.
function annotateUnlock(serviceResult, exitIps) {
  if (!serviceResult || !('platformIp' in serviceResult)) return serviceResult;
  const { platformIp, ...rest } = serviceResult;
  if (!['unlocked', 'limited'].includes(rest.status)) return rest;
  const unlock = classifyUnlock(platformIp, exitIps);
  return unlock ? { ...rest, ...unlock } : rest;
}

function parseTrace(body) {
  return Object.fromEntries(String(body).trim().split('\n').map(line => line.split('=', 2)));
}

function extractRegion(body, fallbackRegion = null) {
  const text = String(body || '');
  return text.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([A-Z]{2})"/)?.[1]
    || text.match(/"currentTerritory"\s*:\s*"([A-Z]{2})"/)?.[1]
    || text.match(/"countryCode"\s*:\s*"([A-Z]{2})"/)?.[1]
    || text.match(/"id"\s*:\s*"([A-Z]{2})"[^{}]{0,200}"countryName"/)?.[1]
    || fallbackRegion;
}

function netflixUnavailable(response) {
  const body = String(response?.data || '');
  return [403, 404, 451].includes(response?.status)
    || /Oh no!|page.?not.?found|not available in your (?:country|region)/i.test(body);
}

function classifyChatGPT(apiResponse, appResponse, fallbackRegion = null) {
  const apiBody = String(apiResponse?.data || '');
  const appBody = String(appResponse?.data || '');
  if (!apiBody || !appBody) return result('error', 'Empty response', fallbackRegion);
  const webBlocked = /unsupported_country/i.test(apiBody);
  const appBlocked = /VPN/i.test(appBody);
  if (webBlocked && appBlocked) return result('blocked', 'Web and app unavailable', fallbackRegion);
  if (!webBlocked && appBlocked) return result('limited', 'Web browser only', fallbackRegion);
  if (webBlocked && !appBlocked) return result('limited', 'Mobile app only', fallbackRegion);
  return result('unlocked', 'Web and app available', fallbackRegion);
}

// Netflix: two licensed (non-original) titles. Both missing -> only Netflix originals are available.
// Both rejected with 403/451 -> the exit IP itself is blocked (this case was unreachable before).
function classifyNetflix(catalog, secondTitle, fallbackRegion = null) {
  const region = extractRegion(catalog?.data, fallbackRegion);
  const rejected = response => [403, 451].includes(response?.status);
  if (rejected(catalog) && rejected(secondTitle)) return result('blocked', `HTTP ${catalog.status}`, fallbackRegion);
  if (netflixUnavailable(catalog) && netflixUnavailable(secondTitle)) return result('limited', 'Originals only', region);
  return result('unlocked', 'Full catalog', region);
}

// TikTok: the web page embeds the visitor's region; a reachable page without one usually means a datacenter IP.
function classifyTikTok(response, fallbackRegion = null) {
  const body = String(response?.data || '');
  if (!body) return result('error', `Empty response (HTTP ${response?.status ?? '-'})`, fallbackRegion);
  const region = body.match(/"region"\s*:\s*"([A-Z]{2})"/)?.[1];
  if (region) return result('unlocked', 'Available', region);
  if ([403, 451].includes(response.status)) return result('blocked', `HTTP ${response.status}`, fallbackRegion);
  return result('limited', 'No region returned (datacenter IP?)', fallbackRegion);
}

// HBO Max: the site redirects to a geo-availability page when the region is unsupported; otherwise the
// first path segment of the final URL is the region code.
function classifyHbo(finalUrl, status, fallbackRegion = null) {
  if (!finalUrl) return result('error', `No redirect information (HTTP ${status ?? '-'})`, fallbackRegion);
  if (/geo-availability/i.test(finalUrl)) return result('blocked', 'Unavailable', fallbackRegion);
  let region = null;
  try {
    const segment = new URL(finalUrl).pathname.split('/').filter(Boolean)[0];
    if (/^[a-z]{2}$/i.test(segment || '')) region = segment.toUpperCase();
  } catch (_) { /* keep fallback */ }
  if (status >= 200 && status < 400) return result('unlocked', 'Available', region || fallbackRegion);
  return result('error', `HTTP ${status}`, region || fallbackRegion);
}

const SERVICE_KEYS = ['netflix', 'youtube', 'disney', 'primeVideo', 'chatgpt', 'tiktok', 'hbo'];

class MediaService {
  constructor() {
    this.agents = new Map();
  }

  getClient(slot = 0) {
    if (!this.agents.has(slot)) this.agents.set(slot, new HttpsProxyAgent(mihomoService.getProxyUrl(slot)));
    const agent = this.agents.get(slot);
    return axios.create({
      timeout: 12000,
      maxRedirects: 5,
      maxContentLength: 2 * 1024 * 1024,
      proxy: false,
      httpAgent: agent,
      httpsAgent: agent,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.8' },
      validateStatus: () => true,
      transformResponse: [(value) => value]
    });
  }

  async safeCheck(check) {
    try {
      return await check();
    } catch (error) {
      return result('error', error.code === 'ECONNABORTED' ? 'Timeout' : error.message);
    }
  }

  async checkNetflix(client, fallbackRegion) {
    // Detection signals adapted from lmc999/RegionRestrictionCheck (AGPL-3.0).
    const [catalog, secondTitle] = await Promise.all([
      client.get('https://www.netflix.com/title/81280792'),
      client.get('https://www.netflix.com/title/70143836')
    ]);
    return {
      ...classifyNetflix(catalog, secondTitle, fallbackRegion),
      platformIp: extractPlatformIp(catalog?.data) || extractPlatformIp(secondTitle?.data)
    };
  }

  async checkYouTube(client, fallbackRegion) {
    const response = await client.get('https://www.youtube.com/premium');
    const body = String(response.data || '');
    return { ...this.classifyYouTube(response, body, fallbackRegion), platformIp: extractPlatformIp(body) };
  }

  classifyYouTube(response, body, fallbackRegion) {
    if (response.status !== 200) return result('blocked', `HTTP ${response.status}`);
    if (/www\.google\.cn/i.test(body)) return result('blocked', 'Unavailable', 'CN');
    if (/Premium is not available in your country/i.test(body)) return result('blocked', 'Unavailable');
    const region = extractRegion(body, fallbackRegion);
    return /ad-free/i.test(body)
      ? result('unlocked', 'Available', region)
      : result('error', 'Page response could not be classified', region);
  }

  async checkDisney(client, fallbackRegion) {
    const device = await client.post('https://disney.api.edge.bamgrid.com/devices', {
      deviceFamily: 'browser',
      applicationRuntime: 'chrome',
      deviceProfile: 'windows',
      attributes: {}
    }, {
      headers: {
        Authorization: `Bearer ${DISNEY_BROWSER_TOKEN}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });
    const deviceBody = String(device.data || '');
    if (device.status === 403 || /403 ERROR|forbidden-location/i.test(deviceBody)) {
      return result('blocked', 'IP blocked by Disney+', fallbackRegion);
    }
    if (!/"assertion"\s*:/i.test(deviceBody)) {
      return result('error', `Device check HTTP ${device.status}`, fallbackRegion);
    }
    const response = await client.get('https://www.disneyplus.com/');
    const body = String(response.data || '');
    if ([403, 451].includes(response.status)) return result('blocked', `HTTP ${response.status}`);
    if (/not available in your region|unavailable in your region/i.test(body)) {
      return result('blocked', 'Unavailable', fallbackRegion);
    }
    return response.status >= 200 && response.status < 400
      ? result('unlocked', 'Landing page available', fallbackRegion)
      : result('error', `HTTP ${response.status}`);
  }

  async checkPrimeVideo(client, fallbackRegion) {
    const response = await client.get('https://www.primevideo.com/');
    const body = String(response.data || '');
    return { ...this.classifyPrimeVideo(response, body, fallbackRegion), platformIp: extractPlatformIp(body) };
  }

  classifyPrimeVideo(response, body, fallbackRegion) {
    const region = extractRegion(body, fallbackRegion);
    if (/isServiceRestricted|Service area restriction|not available in your location/i.test(body)) {
      return result('blocked', 'Unavailable', fallbackRegion);
    }
    if (region) return result('unlocked', 'Available', region);
    return result('error', `Unclassified response (HTTP ${response.status})`, fallbackRegion);
  }

  async checkChatGPT(client, fallbackRegion) {
    const [apiResponse, appResponse, traceResponse] = await Promise.all([
      client.get('https://api.openai.com/compliance/cookie_requirements', {
        headers: { Authorization: 'Bearer null', Origin: 'https://platform.openai.com' }
      }),
      client.get('https://ios.chat.openai.com/'),
      client.get('https://chatgpt.com/cdn-cgi/trace').catch(() => null)
    ]);
    const trace = traceResponse?.status === 200 ? parseTrace(traceResponse.data) : {};
    return { ...classifyChatGPT(apiResponse, appResponse, trace.loc || fallbackRegion), platformIp: trace.ip || null };
  }

  async checkTikTok(client, fallbackRegion) {
    let response = await client.get('https://www.tiktok.com/');
    if (/Please wait\.\.\./i.test(String(response.data || ''))) {
      response = await client.get('https://www.tiktok.com/explore');
    }
    return classifyTikTok(response, fallbackRegion);
  }

  async checkHbo(client, fallbackRegion) {
    const response = await client.get('https://www.max.com/');
    const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL || null;
    return classifyHbo(finalUrl, response.status, fallbackRegion);
  }

  async lookupExit(client) {
    const traceResponse = await this.safeCheck(() => client.get('https://www.cloudflare.com/cdn-cgi/trace'));
    const trace = traceResponse.data ? parseTrace(traceResponse.data) : {};
    if (!trace.ip) {
      const ipResponse = await this.safeCheck(() => client.get('https://api64.ipify.org'));
      const ip = typeof ipResponse?.data === 'string' ? ipResponse.data.trim() : '';
      if (/^[0-9a-f:.]{3,45}$/i.test(ip)) trace.ip = ip;
    }
    return trace;
  }

  // `slot` selects an independent Mihomo select group + local listener so checks can run in parallel.
  async checkNode(node, slot = 0) {
    await mihomoService.selectNode(node.proxyName, slot);
    const client = this.getClient(slot);
    const trace = await this.lookupExit(client);
    const region = trace.loc || null;
    const checks = await Promise.all([
      this.safeCheck(() => this.checkNetflix(client, region)),
      this.safeCheck(() => this.checkYouTube(client, region)),
      this.safeCheck(() => this.checkDisney(client, region)),
      this.safeCheck(() => this.checkPrimeVideo(client, region)),
      this.safeCheck(() => this.checkChatGPT(client, region)),
      this.safeCheck(() => this.checkTikTok(client, region)),
      this.safeCheck(() => this.checkHbo(client, region))
    ]);
    // Region-specific services: the region comes from the flag in the node name (what the airport claims),
    // falling back to where the exit IP really is. A claimed region that disagrees with the exit IP is flagged.
    const claimedRegion = node.region || null;
    const regional = await regionalMedia.checkRegion(client, claimedRegion || region, check => this.safeCheck(check));
    // Sample the general exit IP again: nodes with rotating / load-balanced exits must not be
    // reported as DNS unlocks just because the platform saw a different exit than the first sample.
    const after = await this.lookupExit(client);
    const exitIps = [trace.ip, after.ip];
    // A config reload during the checks would have re-pointed the group; refuse to attribute such
    // results to this node.
    await mihomoService.verifySelected(node.proxyName, slot);
    const annotatedRegional = regional ? {
      ...regional,
      services: Object.fromEntries(Object.entries(regional.services).map(([key, value]) => [key, annotateUnlock(value, exitIps)]))
    } : regional;
    return {
      checkedAt: new Date().toISOString(),
      exit: { ip: trace.ip || null, region, stable: !(trace.ip && after.ip && trace.ip !== after.ip) },
      claimedRegion,
      regionMismatch: Boolean(claimedRegion && region && claimedRegion !== region),
      services: Object.fromEntries(SERVICE_KEYS.map((key, index) => [key, annotateUnlock(checks[index], exitIps)])),
      regional: annotatedRegional
    };
  }
}

module.exports = new MediaService();
module.exports.parseTrace = parseTrace;
module.exports.extractRegion = extractRegion;
module.exports.netflixUnavailable = netflixUnavailable;
module.exports.classifyChatGPT = classifyChatGPT;
module.exports.classifyNetflix = classifyNetflix;
module.exports.classifyTikTok = classifyTikTok;
module.exports.classifyHbo = classifyHbo;
module.exports.SERVICE_KEYS = SERVICE_KEYS;
module.exports.extractPlatformIp = extractPlatformIp;
module.exports.classifyUnlock = classifyUnlock;
module.exports.annotateUnlock = annotateUnlock;
