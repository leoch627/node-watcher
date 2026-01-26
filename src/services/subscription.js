const axios = require('axios');
const YAML = require('js-yaml');
const logger = require('../utils/logger');
const https = require('https');

class SubscriptionService {
  constructor() {
    this.userAgent = 'clash-verge/v1.3.8';
    
    // Create an agent that enforces IPv4 to avoid ETIMEDOUT on dual-stack hosts
    this.httpsAgent = new https.Agent({ 
        family: 4,
        rejectUnauthorized: false,
        keepAlive: true
    });
  }

  async fetchSubscription(url) {
    const commonOptions = {
        timeout: 30000,
        responseType: 'text',
        proxy: false, // Force direct connection, ignore system proxy env vars
        httpsAgent: this.httpsAgent, 
        transitional: {
            clarifyTimeoutError: true
        }
    };

    // 1. Try with Clash Meta user agent (Preferred: returns YAML)
    try {
      logger.info(`Fetching URL with Clash UA: ${url}`);
      const response = await axios.get(url, {
        ...commonOptions,
        headers: {
          'User-Agent': 'Clash.Meta/v1.17.0',
          'Accept': 'text/plain,application/json,text/yaml,application/x-yaml'
        }
      });
      return { data: response.data, format: 'yaml' };
    } catch (e) {
      logger.warn(`Failed with Clash UA, retrying with standard UA... Error: ${e.message}`);
    }

    // 2. Fallback to Standard UA (Returns Base64/Text)
    try {
      logger.info(`Retrying Fetch URL with Standard UA: ${url}`);
      const response = await axios.get(url, {
        ...commonOptions,
        headers: {
          'User-Agent': 'v2rayN/6.23',
          'Accept': 'text/plain,application/json,application/xhtml+xml,application/xml'
        }
      });
      return { data: response.data, format: 'legacy' };
    } catch (error) {
      const errorDetail = error.response 
        ? `Status ${error.response.status}`
        : error.message || 'Unknown error';
      logger.error(`Error fetching subscription from ${url}: ${errorDetail}`);
      throw error;
    }
  }

  async getNodes(subscriptionUrl) {
    const { data, format } = await this.fetchSubscription(subscriptionUrl);
    
    // If we got YAML (Clash format), try to extract proxies directly
    if (format === 'yaml' || data.includes('proxies:') || data.includes('Proxy:')) {
        try {
            const yamlData = YAML.load(data);
            const proxies = yamlData.proxies || yamlData.Proxy || yamlData.proxiesProvider || [];
            
            if (Array.isArray(proxies) && proxies.length > 0) {
               logger.info(`Detected Clash YAML format. Found ${proxies.length} proxies.`);
               // Return strictly the proxies array to be injected directly
               return { type: 'clash_direct', proxies: proxies, groups: yamlData['proxy-groups'] };
            }
        } catch (e) {
            logger.warn('Failed to parse as Clash YAML, falling back to line parsing');
        }
    }

    // Fallback: Parse as V2Ray/Base64/Lines (Legacy format)
    return { type: 'parsed', nodes: this.parseLegacyFormat(data) };
  }

  parseLegacyFormat(data) {
      try {
        if (!data) return [];
        let decoded = data;
        
        // Try Base64 detection & decoding
        try {
            const cleanData = data.trim().replace(/\s/g, ''); 
            if (/^[A-Za-z0-9+/=]+$/.test(cleanData)) {
                const buf = Buffer.from(cleanData, 'base64');
                const str = buf.toString('utf-8');
                if (str.includes('://')) {
                    decoded = str;
                }
            }
        } catch (e) {}

        const lines = decoded.split(/[\r\n]+/).filter(line => line.trim());
        const nodes = [];

        for (const line of lines) {
            const node = this.parseNode(line);
            if (node) nodes.push(node);
        }
        
        logger.info(`Parsed ${nodes.length} nodes from legacy text format.`);
        return nodes;
    } catch (error) {
        logger.error('Error parsing legacy subscription:', error);
        return [];
    }
  }

  parseNode(line) {
    // Basic parser for VLESS/VMESS/SS to Object
    // Only used when we CANNOT get the raw Clash YAML
    try {
      const trimmed = line.trim();
      if (trimmed.startsWith('vless://')) return this.parseVless(trimmed);
      if (trimmed.startsWith('vmess://')) return this.parseVmess(trimmed);
      if (trimmed.startsWith('ss://')) return this.parseShadowsocks(trimmed);
      if (trimmed.startsWith('trojan://')) return this.parseTrojan(trimmed);
      return null;
    } catch (e) { return null; }
  }

  parseVless(url) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      return {
        protocol: 'vless',
        name: decodeURIComponent(urlObj.hash.substring(1)) || 'Unknown',
        server: urlObj.hostname,
        port: parseInt(urlObj.port, 10),
        uuid: urlObj.username,
        type: params.get('type') || 'tcp',
        tls: params.get('security') === 'tls' || params.get('security') === 'reality',
        'skip-cert-verify': true, // default for stability
        servername: params.get('sni'),
        network: params.get('type'),
        flow: params.get('flow'),
        'reality-opts': params.get('security') === 'reality' ? {
            'public-key': params.get('pbk'),
            'short-id': params.get('sid')
        } : undefined,
        'client-fingerprint': params.get('fp')
      };
    } catch (e) { return null; }
  }
  
  parseVmess(url) {
      // Simplified VMess parser
      return { protocol: 'vmess', name: 'VMess Node' }; 
  }
  
  parseShadowsocks(url) {
      return { protocol: 'shadowsocks', name: 'SS Node' };
  }
  
  parseTrojan(url) {
      return { protocol: 'trojan', name: 'Trojan Node' };
  }
}

module.exports = new SubscriptionService();
