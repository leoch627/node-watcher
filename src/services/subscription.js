const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('../utils/logger');
const nodeParser = require('./nodeParser');

class SubscriptionService {
  constructor() {
    this.httpAgent = new http.Agent({ keepAlive: true });
    this.httpsAgent = new https.Agent({ keepAlive: true });
  }

  // Raw response of the first user agent that works (headers included).
  async fetchResponse(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      throw new Error('Invalid subscription URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Subscription URL must use HTTP or HTTPS');
    }
    const options = {
      timeout: 30000, responseType: 'text', maxContentLength: 8 * 1024 * 1024,
      proxy: false, httpAgent: this.httpAgent, httpsAgent: this.httpsAgent,
      transformResponse: [(value) => value]
    };
    let firstError;
    for (const userAgent of ['Clash.Meta/1.19 NodeWatcher/2.0', 'v2rayN/7.0 NodeWatcher/2.0']) {
      try {
        const response = await axios.get(url, {
          ...options,
          headers: { 'User-Agent': userAgent, Accept: 'text/plain, text/yaml, application/yaml, application/x-yaml' }
        });
        return response;
      } catch (error) {
        firstError ||= error;
      }
    }
    throw firstError;
  }

  async fetchSubscription(url) {
    return String((await this.fetchResponse(url)).data || '');
  }

  // Content plus the traffic info airports send in `subscription-userinfo`.
  async fetchWithInfo(url) {
    const response = await this.fetchResponse(url);
    return { content: String(response.data || ''), userinfo: parseUserinfo(response.headers?.['subscription-userinfo']) };
  }

  async getNodes(subscriptionUrl) {
    const content = await this.fetchSubscription(subscriptionUrl);
    const result = nodeParser.parseContent(content);
    if (result.proxies.length === 0) {
      throw new Error(result.errors[0]?.error || 'No supported nodes found');
    }
    logger.info(`Parsed ${result.proxies.length} ${result.format} nodes`);
    return result;
  }

  parseContent(content) {
    return nodeParser.parseContent(content);
  }
}

// "upload=1; download=2; total=3; expire=1700000000" -> { upload, download, total, expire } (bytes,
// unix seconds; expire null when missing or 0).
function parseUserinfo(header) {
  if (!header) return null;
  const values = {};
  for (const part of String(header).split(';')) {
    const [key, raw] = part.split('=').map(item => item && item.trim());
    if (!key || raw === undefined) continue;
    const number = Number(raw);
    if (Number.isFinite(number) && number >= 0) values[key.toLowerCase()] = number;
  }
  if (!['upload', 'download', 'total'].some(key => key in values)) return null;
  return {
    upload: values.upload || 0, download: values.download || 0, total: values.total || 0,
    expire: values.expire > 0 ? values.expire : null
  };
}

module.exports = new SubscriptionService();
module.exports.parseUserinfo = parseUserinfo;
