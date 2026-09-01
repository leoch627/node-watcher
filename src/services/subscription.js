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

  async fetchSubscription(url) {
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
        return String(response.data || '');
      } catch (error) {
        firstError ||= error;
      }
    }
    throw firstError;
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

module.exports = new SubscriptionService();
