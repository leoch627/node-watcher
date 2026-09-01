const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const mihomoService = require('./mihomo');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';
const DISNEY_BROWSER_TOKEN = 'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84';

function result(status, detail, region = null) {
  return { status, detail, region };
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

class MediaService {
  constructor() {
    this.agent = null;
  }

  getClient() {
    if (!this.agent) this.agent = new HttpsProxyAgent(mihomoService.getProxyUrl());
    return axios.create({
      timeout: 12000,
      maxRedirects: 5,
      maxContentLength: 2 * 1024 * 1024,
      proxy: false,
      httpAgent: this.agent,
      httpsAgent: this.agent,
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
    const catalogUnavailable = netflixUnavailable(catalog);
    const secondUnavailable = netflixUnavailable(secondTitle);
    const region = extractRegion(catalog.data, fallbackRegion);
    if (catalogUnavailable && secondUnavailable) return result('limited', 'Originals only', region);
    if (!catalogUnavailable || !secondUnavailable) return result('unlocked', 'Full catalog', region);
    return result('blocked', 'Unavailable', region);
  }

  async checkYouTube(client, fallbackRegion) {
    const response = await client.get('https://www.youtube.com/premium');
    const body = String(response.data || '');
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
    const region = extractRegion(body, fallbackRegion);
    if (/isServiceRestricted|Service area restriction|not available in your location/i.test(body)) {
      return result('blocked', 'Unavailable', fallbackRegion);
    }
    if (region) return result('unlocked', 'Available', region);
    return result('error', `Unclassified response (HTTP ${response.status})`, fallbackRegion);
  }

  async checkChatGPT(client, fallbackRegion) {
    const [apiResponse, appResponse] = await Promise.all([
      client.get('https://api.openai.com/compliance/cookie_requirements', {
        headers: { Authorization: 'Bearer null', Origin: 'https://platform.openai.com' }
      }),
      client.get('https://ios.chat.openai.com/')
    ]);
    return classifyChatGPT(apiResponse, appResponse, fallbackRegion);
  }

  async checkNode(node) {
    await mihomoService.selectNode(node.proxyName);
    const client = this.getClient();
    const traceResponse = await this.safeCheck(() => client.get('https://www.cloudflare.com/cdn-cgi/trace'));
    const trace = traceResponse.data ? parseTrace(traceResponse.data) : {};
    const region = trace.loc || null;
    const checks = await Promise.all([
      this.safeCheck(() => this.checkNetflix(client, region)),
      this.safeCheck(() => this.checkYouTube(client, region)),
      this.safeCheck(() => this.checkDisney(client, region)),
      this.safeCheck(() => this.checkPrimeVideo(client, region)),
      this.safeCheck(() => this.checkChatGPT(client, region))
    ]);
    return {
      checkedAt: new Date().toISOString(),
      exit: { ip: trace.ip || null, region },
      services: {
        netflix: checks[0], youtube: checks[1], disney: checks[2],
        primeVideo: checks[3], chatgpt: checks[4]
      }
    };
  }
}

module.exports = new MediaService();
module.exports.parseTrace = parseTrace;
module.exports.extractRegion = extractRegion;
module.exports.netflixUnavailable = netflixUnavailable;
module.exports.classifyChatGPT = classifyChatGPT;
