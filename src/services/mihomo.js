const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const logger = require('../utils/logger');

class MihomoService {
  constructor() {
    this.apiUrl = 'http://127.0.0.1:9090';
    this.secret = 'node-watcher-secret';
    this.process = null;
    this.configPath = path.join(process.cwd(), 'mihomo-config.yaml');
    this.workDir = path.join(process.cwd(), 'mihomo-data');
  }

  async start() {
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }

    // Basic config for mihomo
    const baseConfig = `
port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
external-controller: 0.0.0.0:9090
secret: "${this.secret}"
proxies: []
    `;

    fs.writeFileSync(this.configPath, baseConfig);

    // Stop existing process if any
    this.stop();

    logger.info('Starting Mihomo (Clash Meta) core...');
    
    // Determine mihomo executable path
    let executable = 'mihomo';
    const localBin = path.join(process.cwd(), 'bin', 'mihomo');
    if (fs.existsSync(localBin)) {
      executable = localBin;
      logger.info(`Using local mihomo binary: ${executable}`);
    }

    try {
      this.process = spawn(executable, ['-d', this.workDir, '-f', this.configPath], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        logger.info(`[Mihomo] ${data.toString().trim()}`);
      });

      this.process.stderr.on('data', (data) => {
        logger.warn(`[Mihomo] ${data.toString().trim()}`);
      });

      this.process.on('close', (code) => {
        logger.warn(`Mihomo process exited with code ${code}`);
      });

      // Wait for API to be ready
      await this.waitForApi();
      logger.info('Mihomo core started successfully');

    } catch (err) {
      logger.error('Failed to start Mihomo:', err);
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async waitForApi(retries = 10) {
    for (let i = 0; i < retries; i++) {
      try {
        await axios.get(`${this.apiUrl}/version`, {
          headers: { Authorization: `Bearer ${this.secret}` }
        });
        return true;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Mihomo API failed to start');
  }

  /**
   * Convert internal node format to Clash Proxy format
   */
  convertToClashProxy(node) {
    // PASSTHROUGH: If node is already a valid Clash proxy object (from direct YAML fetch)
    // Check for key fields: server, port, type/cipher/uuid depending on protocol
    if (node.server && node.port && (node.type || node.protocol)) {
        // Ensure strictly 'type' is used, logic might have passed 'protocol'
        return {
            ...node,
            type: node.type || node.protocol
        };
    }

    const common = {
      name: node.name,
      server: node.address,
      port: node.port,
      type: node.protocol,
      udp: true
    };

    if (node.protocol === 'vmess') {
      return {
        ...common,
        uuid: node.id,
        alterId: node.alterId || 0,
        cipher: 'auto',
        network: node.network || 'tcp',
        tls: node.tls === 'tls',
        servername: node.host || '',
        'ws-opts': node.network === 'ws' ? {
          path: node.path || '/',
          headers: { Host: node.host || '' }
        } : undefined
      };
    }

    if (node.protocol === 'vless') {
      const proxy = {
        ...common,
        uuid: node.id,
        cipher: 'auto',
        network: node.network || 'tcp',
        tls: node.security === 'tls' || node.security === 'reality',
        flow: node.flow || undefined,
        servername: node.sni || node.host || '',
        'client-fingerprint': node.fingerprint || undefined,
      };

      if (node.security === 'reality') {
        proxy['reality-opts'] = {
          'public-key': node.reality?.publicKey,
          'short-id': node.reality?.shortId
        };
      }
      
      if (node.network === 'ws') {
        proxy['ws-opts'] = {
          path: node.path || '/',
          headers: { Host: node.host || '' }
        };
      }

      if (node.network === 'grpc') {
          proxy['grpc-opts'] = {
            'grpc-service-name': node.serviceName || ''
          };
      }

      return proxy;
    }

    if (node.protocol === 'trojan') {
      return {
        ...common,
        password: node.password,
        sni: node.sni || '',
        'skip-cert-verify': node.skipCertVerify === true, // correct key name
        udp: true // Ensure UDP enabled
      };
    }

    if (node.protocol === 'shadowsocks') {
      // Mihomo/Clash use 'ss' for type, not 'shadowsocks'
      return {
        ...common,
        type: 'ss',
        cipher: node.method,
        password: node.password
      };
    }

    return null; // Unsupported protocol
  }

  /**
   * Update all proxies in Mihomo
   */
  async updateProxies(nodes) {
    const proxies = nodes
      .map(n => this.convertToClashProxy(n))
      .filter(p => p !== null);

    // Create a config object
    const config = {
      port: 7890,
      'socks-port': 7891,
      'allow-lan': false,
      mode: 'rule',
      'log-level': 'debug', // Change to debug
      'external-controller': '0.0.0.0:9090',
      secret: this.secret,
      dns: {
        enable: true,
        ipv6: false,
        'enhanced-mode': 'fake-ip',
        nameserver: [
           '114.114.114.114',
           '8.8.8.8'
        ]
      },
      proxies: proxies
    };

    try {
      // Use js-yaml to safe dump
      const newConfigContent = yaml.dump(config);
      
      fs.writeFileSync(this.configPath, newConfigContent);
      
      // Reload config
      await axios.put(`${this.apiUrl}/configs?force=true`, { path: this.configPath }, {
        headers: { Authorization: `Bearer ${this.secret}` }
      });
      
      logger.info(`Updated Mihomo with ${proxies.length} proxies`);
      return proxies.map(p => p.name);
    } catch (error) {
      if (error.response && error.response.data) {
        // Log the full error object from Mihomo
        logger.error(`Failed to update Mihomo proxies (API Error): ${JSON.stringify(error.response.data)}`);
        
        // Dump the failing config for debugging
        try {
           fs.writeFileSync(path.join(process.cwd(), 'logs', 'mihomo-proxy-dump-failed.yaml'), yaml.dump({ proxies: proxies }));
           logger.info('Dumped failing proxy config to logs/mihomo-proxy-dump-failed.yaml');
        } catch (e) {}
      } else {
        logger.error(`Failed to update Mihomo proxies: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Test latency for a specific node name
   */
  async testNode(nodeName, timeout = 5000) {
    try {
      const encodedName = encodeURIComponent(nodeName);
      const url = `${this.apiUrl}/proxies/${encodedName}/delay?timeout=${timeout}&url=http://www.gstatic.com/generate_204`;
      
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.secret}` },
        timeout: timeout + 1000
      });

      return {
        online: true,
        latency: res.data.delay
      };
    } catch (error) {
      // 503 means timeout/unreachable usually
      return {
        online: false,
        latency: 0,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

module.exports = new MihomoService();
