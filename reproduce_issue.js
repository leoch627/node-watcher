const fs = require('fs');
const YAML = require('js-yaml');
const path = require('path');

// Mock Logger
const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log
};

class SubscriptionService {
  parseSubscription(data) {
    try {
      if (!data) return [];
      
      // 1. Try to parse as YAML (Clash format)
      try {
        console.log('Attempting YAML parse...');
        if (data.includes('proxies:') || data.includes('Proxy:')) { 
            const yamlData = YAML.load(data);
            const proxies = yamlData.proxies || yamlData.Proxy || yamlData.proxiesProvider || [];
            if (Array.isArray(proxies) && proxies.length > 0) {
               logger.info(`Detected YAML format. Found ${proxies.length} proxies.`);
               return this.parseClashProxies(proxies);
            }
        }
      } catch (e) {
        logger.debug('YAML parse failed, trying others...', e.message);
      }

      // 2. Try Base64 decoding (standard V2Ray/V2Board format)
      console.log('Attempting Base64 decode...');
      let decoded = data;
      let isBase64 = false;
      try {
        const cleanData = data.trim().replace(/\s/g, ''); 
        
        if (/^[A-Za-z0-9+/=]+$/.test(cleanData)) {
            const buf = Buffer.from(cleanData, 'base64');
            const str = buf.toString('utf-8');
            if (str.includes('://')) {
                decoded = str;
                isBase64 = true;
            }
        }
      } catch (e) {}

      if (isBase64) {
          logger.info('Detected Base64 encoded subscription.');
      } else {
          console.log('Not Base64.');
      }

      console.log('Splitting lines...');
      const lines = decoded.split(/[\r\n]+/).filter(line => line.trim());
      console.log(`Found ${lines.length} lines.`);
      
      const nodes = [];

      for (const line of lines) {
        const node = this.parseNode(line);
        if (node) {
          nodes.push(node);
        }
      }
      
      logger.info(`Parsed ${nodes.length} nodes from subscription.`);
      return nodes;
    } catch (error) {
      logger.error('Error parsing subscription:', error);
      throw error;
    }
  }

  parseClashProxies(proxies) {
    return proxies.map(proxy => {
      try {
        const node = {
          name: proxy.name,
          address: proxy.server,
          port: proxy.port,
          protocol: proxy.type,
          // ... simplified for repro ...
        };
        return node;
      } catch (e) {
        return null;
      }
    }).filter(n => n !== null);
  }

  parseNode(line) {
    try {
      const trimmed = line.trim();
      if (trimmed.startsWith('vmess://')) {
        return { type: 'vmess' };
      } else if (trimmed.startsWith('vless://')) {
        return this.parseVless(trimmed);
      } else if (trimmed.startsWith('ss://')) {
        return this.parseShadowsocks(trimmed);
      }
      console.log('Failed to parse line start:', trimmed.substring(0, 20));
      return null;
    } catch (error) {
      logger.warn('Error parsing node:', error.message);
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
        flow: params.get('flow') || '',
        sni: params.get('sni') || '',
        host: params.get('host') || '',
        path: params.get('path') || '',
        headerType: params.get('headerType') || '',
        fingerprint: params.get('fp') || '',
        alpn: params.get('alpn') || '',
        pbk: params.get('pbk') || '', // Reality PublicKey
        sid: params.get('sid') || '', // Reality ShortId
        spx: params.get('spx') || '', // Reality SpiderX
      };

      // Support for vless+reality specific structure if needed by clients
      if (params.get('security') === 'reality') {
        node.reality = {
          publicKey: node.pbk, // Map pbk to publicKey
          shortId: node.sid,   // Map sid to shortId
          serverName: node.sni,
          fingerprint: node.fingerprint || 'chrome', // Default to chrome if missing
          spiderX: node.spx
        };
      }
      
      return node;
    } catch (error) {
      logger.warn('Error parsing vless node:', error.message);
      return null;
    }
  }

  parseShadowsocks(url) {
    try {
      const withoutPrefix = url.replace('ss://', '');
      const [encoded, name] = withoutPrefix.split('#');
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      
      // Handle legacy SS format (method:pass@server:port)
      if (decoded.includes('@')) {
          const [methodAndPass, serverAndPort] = decoded.split('@');
          const [method, password] = methodAndPass.split(':');
          const [address, port] = serverAndPort.split(':');
          return {
            protocol: 'shadowsocks',
            name: name ? decodeURIComponent(name) : 'Unknown',
            address: address,
            port: parseInt(port, 10),
            method: method,
            password: password
          };
      }
      return null;
    } catch (error) {
      logger.warn('Error parsing shadowsocks node:', error.message);
      return null;
    }
  }
}

async function run() {
    const service = new SubscriptionService();

    console.log('--- Testing V2Ray File ---');
    try {
        const v2rayData = fs.readFileSync('sub_v2ray.txt', 'utf8');
        const nodes = service.parseSubscription(v2rayData);
        console.log('V2Ray Nodes:', nodes.length);
    } catch (e) {
        console.error('V2Ray File Error', e);
    }

    console.log('\n--- Testing Clash File ---');
    try {
        const clashData = fs.readFileSync('sub_clash.yaml', 'utf8');
        const nodes = service.parseSubscription(clashData);
        console.log('Clash Nodes:', nodes.length);
    } catch (e) {
        console.error('Clash File Error', e);
    }
}

run();
