const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const mihomoService = require('./mihomo');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

function result(status, detail, region = null) {
  return { status, detail, region };
}

function parseTrace(body) {
  return Object.fromEntries(String(body).trim().split('\n').map(line => line.split('=', 2)));
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
    const response = await client.get('https://www.netflix.com/title/81280792');
    const body = String(response.data || '');
    if ([403, 451].includes(response.status)) return result('blocked', `HTTP ${response.status}`);
    if (response.status === 404 || /page.?not.?found/i.test(body)) {
      const original = await client.get('https://www.netflix.com/title/70143836');
      return original.status === 200
        ? result('limited', 'Originals only', fallbackRegion)
        : result('blocked', `HTTP ${original.status}`);
    }
    if (response.status === 200) return result('unlocked', 'Full catalog', fallbackRegion);
    return result('error', `HTTP ${response.status}`);
  }

  async checkYouTube(client, fallbackRegion) {
    const response = await client.get('https://www.youtube.com/premium');
    const body = String(response.data || '');
    if (response.status !== 200) return result('blocked', `HTTP ${response.status}`);
    if (/Premium is not available in your country/i.test(body)) return result('blocked', 'Unavailable');
    const region = body.match(/"countryCode":"([A-Z]{2})"/)?.[1]
      || body.match(/"GL":"([A-Z]{2})"/)?.[1]
      || fallbackRegion;
    return /youtube premium/i.test(body)
      ? result('unlocked', 'Available', region)
      : result('limited', 'Region uncertain', region);
  }

  async checkDisney(client, fallbackRegion) {
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
    if (/Service area restriction|not available in your location/i.test(body)) {
      return result('blocked', 'Unavailable', fallbackRegion);
    }
    return response.status >= 200 && response.status < 400
      ? result('unlocked', 'Available', fallbackRegion)
      : result('error', `HTTP ${response.status}`);
  }

  async checkChatGPT(client, fallbackRegion) {
    const response = await client.get('https://chatgpt.com/cdn-cgi/trace');
    if (response.status !== 200) return result('blocked', `HTTP ${response.status}`);
    const trace = parseTrace(response.data);
    return result('unlocked', 'Reachable', trace.loc || fallbackRegion);
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
