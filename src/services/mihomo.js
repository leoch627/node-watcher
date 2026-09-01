const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const YAML = require('js-yaml');
const logger = require('../utils/logger');

const GROUP_NAME = 'NODE-WATCHER';

class MihomoService {
  constructor(options = {}) {
    this.httpPort = Number(options.httpPort ?? process.env.MIHOMO_HTTP_PORT ?? 23333);
    this.socksPort = Number(options.socksPort ?? process.env.MIHOMO_SOCKS_PORT ?? this.httpPort + 1);
    this.controllerPort = Number(options.controllerPort ?? process.env.MIHOMO_CONTROLLER_PORT ?? this.httpPort + 2);
    this.apiUrl = options.apiUrl || process.env.MIHOMO_API_URL || `http://127.0.0.1:${this.controllerPort}`;
    this.secret = options.secret || process.env.MIHOMO_SECRET || 'node-watcher-secret';
    this.process = null;
    this.ready = false;
    this.workDir = options.workDir || path.join(process.cwd(), 'data', 'mihomo');
    this.configPath = path.join(this.workDir, 'config.yaml');
  }

  headers() {
    return { Authorization: `Bearer ${this.secret}` };
  }

  buildConfig(nodes = []) {
    const proxies = nodes.map(node => node.proxy || this.convertLegacyNode(node)).filter(Boolean);
    const config = {
      port: this.httpPort,
      'socks-port': this.socksPort,
      'allow-lan': false,
      mode: 'rule',
      'log-level': process.env.MIHOMO_LOG_LEVEL || 'warning',
      'external-controller': `127.0.0.1:${this.controllerPort}`,
      secret: this.secret,
      dns: {
        enable: true,
        ipv6: false,
        'enhanced-mode': 'fake-ip',
        nameserver: ['1.1.1.1', '8.8.8.8']
      },
      proxies
    };
    if (proxies.length > 0) {
      config['proxy-groups'] = [{ name: GROUP_NAME, type: 'select', proxies: proxies.map(item => item.name) }];
      config.rules = [`MATCH,${GROUP_NAME}`];
    }
    return config;
  }

  writeConfig(nodes = []) {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.mkdirSync(this.workDir, { recursive: true });
    fs.writeFileSync(this.configPath, YAML.dump(this.buildConfig(nodes), { noRefs: true, lineWidth: -1 }));
  }

  async start() {
    this.writeConfig();
    this.stop();
    const localBin = path.join(process.cwd(), 'bin', 'mihomo');
    const executable = process.env.MIHOMO_BIN || (fs.existsSync(localBin) ? localBin : 'mihomo');
    logger.info(`Starting Mihomo: ${executable}`);
    this.process = spawn(executable, ['-d', this.workDir, '-f', this.configPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.process.stdout.on('data', data => logger.info(`[Mihomo] ${data.toString().trim()}`));
    this.process.stderr.on('data', data => logger.warn(`[Mihomo] ${data.toString().trim()}`));
    this.process.on('error', error => {
      this.ready = false;
      logger.error(`Mihomo process error: ${error.message}`);
    });
    this.process.on('close', code => {
      this.ready = false;
      logger.warn(`Mihomo exited with code ${code}`);
    });
    await this.waitForApi();
    this.ready = true;
    logger.info('Mihomo core is ready');
  }

  stop() {
    if (this.process) this.process.kill('SIGTERM');
    this.process = null;
    this.ready = false;
  }

  async waitForApi(retries = 20) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        await axios.get(`${this.apiUrl}/version`, { headers: this.headers(), timeout: 1000 });
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error(`Mihomo API did not start: ${lastError?.message || 'unknown error'}`);
  }

  convertLegacyNode(node) {
    if (node.server && node.port && (node.type || node.protocol)) {
      return { ...node, name: node.proxyName || node.name, type: node.type || node.protocol };
    }
    const type = node.protocol === 'shadowsocks' ? 'ss' : node.protocol;
    if (!node.address || !node.port || !type) return null;
    const proxy = { name: node.proxyName || node.name, type, server: node.address, port: Number(node.port), udp: true };
    if (type === 'vless' || type === 'vmess') Object.assign(proxy, {
      uuid: node.uuid || node.id, network: node.network || 'tcp', tls: node.tls === true || node.security === 'tls'
    });
    if (type === 'trojan' || type === 'hysteria2') proxy.password = node.password;
    if (type === 'ss') Object.assign(proxy, { cipher: node.method, password: node.password });
    return proxy;
  }

  async updateProxies(nodes) {
    this.writeConfig(nodes);
    if (!this.ready) return [];
    await axios.put(`${this.apiUrl}/configs?force=true`, { path: this.configPath }, {
      headers: this.headers(), timeout: 10000
    });
    logger.info(`Loaded ${nodes.length} nodes into Mihomo`);
    return nodes.map(node => node.proxyName || node.name);
  }

  async testNode(proxyName, timeout = 8000) {
    if (!this.ready) return { online: false, latency: null, error: 'Mihomo is not ready' };
    try {
      const response = await axios.get(`${this.apiUrl}/proxies/${encodeURIComponent(proxyName)}/delay`, {
        headers: this.headers(), timeout: timeout + 1000,
        params: { timeout, url: 'https://www.gstatic.com/generate_204' }
      });
      return { online: true, latency: response.data.delay };
    } catch (error) {
      return {
        online: false,
        latency: null,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async selectNode(proxyName) {
    if (!this.ready) throw new Error('Mihomo is not ready');
    await axios.put(`${this.apiUrl}/proxies/${encodeURIComponent(GROUP_NAME)}`, { name: proxyName }, {
      headers: this.headers(), timeout: 5000
    });
  }

  getProxyUrl() {
    return `http://127.0.0.1:${this.httpPort}`;
  }
}

module.exports = new MihomoService();
module.exports.GROUP_NAME = GROUP_NAME;
module.exports.MihomoService = MihomoService;
