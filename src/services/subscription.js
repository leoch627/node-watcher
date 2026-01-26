const axios = require('axios');
const logger = require('../utils/logger');

class SubscriptionService {
  constructor() {
    this.userAgent = 'clash-verge/v1.3.8';
  }

  async fetchSubscription(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching subscription from ${url}:`, error.message);
      throw error;
    }
  }

  parseSubscription(data) {
    try {
      // V2Board subscription is usually base64 encoded
      let decoded;
      try {
        decoded = Buffer.from(data, 'base64').toString('utf-8');
      } catch (e) {
        // If not base64, assume it's plain text
        decoded = data;
      }

      const lines = decoded.split('\n').filter(line => line.trim());
      const nodes = [];

      for (const line of lines) {
        const node = this.parseNode(line);
        if (node) {
          nodes.push(node);
        }
      }

      return nodes;
    } catch (error) {
      logger.error('Error parsing subscription:', error);
      throw error;
    }
  }

  parseNode(line) {
    try {
      const trimmed = line.trim();
      
      // Parse different protocols
      if (trimmed.startsWith('vmess://')) {
        return this.parseVmess(trimmed);
      } else if (trimmed.startsWith('vless://')) {
        return this.parseVless(trimmed);
      } else if (trimmed.startsWith('trojan://')) {
        return this.parseTrojan(trimmed);
      } else if (trimmed.startsWith('ss://')) {
        return this.parseShadowsocks(trimmed);
      }
      
      return null;
    } catch (error) {
      logger.warn('Error parsing node:', error.message);
      return null;
    }
  }

  parseVmess(url) {
    try {
      const base64Data = url.replace('vmess://', '');
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      const config = JSON.parse(decoded);
      
      return {
        protocol: 'vmess',
        name: config.ps || config.remarks || 'Unknown',
        address: config.add || config.address,
        port: parseInt(config.port, 10),
        id: config.id,
        alterId: config.aid || 0,
        network: config.net || 'tcp',
        type: config.type || 'none',
        host: config.host || '',
        path: config.path || '',
        tls: config.tls || ''
      };
    } catch (error) {
      logger.warn('Error parsing vmess node:', error.message);
      return null;
    }
  }

  parseVless(url) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      
      const node = {
        protocol: 'vless',
        name: decodeURIComponent(urlObj.hash.substring(1)) || 'Unknown',
        address: urlObj.hostname,
        port: parseInt(urlObj.port, 10),
        id: urlObj.username,
        network: params.get('type') || 'tcp',
        security: params.get('security') || 'none',
        flow: params.get('flow') || ''
      };

      // Support for vless+reality
      if (params.get('security') === 'reality') {
        node.reality = {
          publicKey: params.get('pbk') || '',
          shortId: params.get('sid') || '',
          serverName: params.get('sni') || '',
          fingerprint: params.get('fp') || 'chrome',
          spiderX: params.get('spx') || ''
        };
      }

      // Additional parameters
      if (params.get('sni')) {
        node.sni = params.get('sni');
      }
      if (params.get('alpn')) {
        node.alpn = params.get('alpn');
      }
      if (params.get('fp')) {
        node.fingerprint = params.get('fp');
      }
      
      return node;
    } catch (error) {
      logger.warn('Error parsing vless node:', error.message);
      return null;
    }
  }

  parseTrojan(url) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      
      return {
        protocol: 'trojan',
        name: decodeURIComponent(urlObj.hash.substring(1)) || 'Unknown',
        address: urlObj.hostname,
        port: parseInt(urlObj.port, 10),
        password: urlObj.username,
        sni: params.get('sni') || urlObj.hostname,
        type: params.get('type') || 'tcp'
      };
    } catch (error) {
      logger.warn('Error parsing trojan node:', error.message);
      return null;
    }
  }

  parseShadowsocks(url) {
    try {
      const withoutPrefix = url.replace('ss://', '');
      const [encoded, name] = withoutPrefix.split('#');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [method, passwordAndServer] = decoded.split(':');
      const lastAtIndex = passwordAndServer.lastIndexOf('@');
      const password = passwordAndServer.substring(0, lastAtIndex);
      const serverAndPort = passwordAndServer.substring(lastAtIndex + 1);
      const [address, port] = serverAndPort.split(':');
      
      return {
        protocol: 'shadowsocks',
        name: name ? decodeURIComponent(name) : 'Unknown',
        address: address,
        port: parseInt(port, 10),
        method: method,
        password: password
      };
    } catch (error) {
      logger.warn('Error parsing shadowsocks node:', error.message);
      return null;
    }
  }

  async getNodes(subscriptionUrl) {
    const data = await this.fetchSubscription(subscriptionUrl);
    return this.parseSubscription(data);
  }
}

module.exports = new SubscriptionService();
