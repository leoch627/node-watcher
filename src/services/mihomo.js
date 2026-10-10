const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const YAML = require('js-yaml');
const logger = require('../utils/logger');
const { writeFileAtomic } = require('../utils/atomicWrite');

const GROUP_NAME = 'NODE-WATCHER';
const DEFAULT_PROBE_URL = 'https://www.gstatic.com/generate_204';
const MAX_RESTART_DELAY_MS = 30000;
// Controller errors that mean "Mihomo itself is unreachable", not "this node is down".
const CONTROLLER_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

class MihomoService {
  constructor(options = {}) {
    this.httpPort = Number(options.httpPort ?? process.env.MIHOMO_HTTP_PORT ?? 23333);
    this.socksPort = Number(options.socksPort ?? process.env.MIHOMO_SOCKS_PORT ?? this.httpPort + 1);
    this.controllerPort = Number(options.controllerPort ?? process.env.MIHOMO_CONTROLLER_PORT ?? this.httpPort + 2);
    this.apiUrl = options.apiUrl || process.env.MIHOMO_API_URL || `http://127.0.0.1:${this.controllerPort}`;
    this.secret = options.secret || process.env.MIHOMO_SECRET || 'node-watcher-secret';
    // Parallel media-check "slots". Slot 0 is the original NODE-WATCHER group on the HTTP port.
    // Slots >= 1 each get their own select group and a dedicated local listener (opt-in, see README).
    this.mediaSlots = Math.max(1, Math.min(8, Number(options.mediaSlots ?? process.env.MEDIA_CONCURRENCY ?? 1) || 1));
    this.mediaBasePort = Number(options.mediaBasePort ?? process.env.MIHOMO_MEDIA_BASE_PORT ?? this.httpPort + 10);
    this.process = null;
    this.ready = false;
    this.stopping = false;
    this.restartTimer = null;
    this.restartAttempts = 0;
    this.startedAt = null;
    this.currentNodes = [];
    this.lastConfigHash = null;
    this.controllerFailures = 0;
    this.controllerFailingSince = null;
    this.workDir = options.workDir || path.join(process.cwd(), 'data', 'mihomo');
    this.configPath = path.join(this.workDir, 'config.yaml');
  }

  headers() {
    return { Authorization: `Bearer ${this.secret}` };
  }

  groupName(slot = 0) {
    return slot === 0 ? GROUP_NAME : `${GROUP_NAME}-${slot}`;
  }

  slotPort(slot = 0) {
    return slot === 0 ? this.httpPort : this.mediaBasePort + slot - 1;
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
      const names = proxies.map(item => item.name);
      config['proxy-groups'] = [{ name: GROUP_NAME, type: 'select', proxies: names }];
      config.rules = [`MATCH,${GROUP_NAME}`];
      if (this.mediaSlots > 1) {
        config.listeners = [];
        for (let slot = 1; slot < this.mediaSlots; slot += 1) {
          config['proxy-groups'].push({ name: this.groupName(slot), type: 'select', proxies: names });
          config.listeners.push({
            name: `node-watcher-media-${slot}`, type: 'mixed', listen: '127.0.0.1',
            port: this.slotPort(slot), proxy: this.groupName(slot)
          });
        }
      }
    }
    return config;
  }

  // Writes the config atomically and returns the YAML text that was written.
  writeConfig(nodes = []) {
    fs.mkdirSync(this.workDir, { recursive: true });
    const text = YAML.dump(this.buildConfig(nodes), { noRefs: true, lineWidth: -1 });
    writeFileAtomic(this.configPath, text);
    return text;
  }

  async start() {
    this.stopping = false;
    this.clearRestartTimer();
    const text = this.writeConfig(this.currentNodes);
    this.killProcess();
    const localBin = path.join(process.cwd(), 'bin', 'mihomo');
    const executable = process.env.MIHOMO_BIN || (fs.existsSync(localBin) ? localBin : 'mihomo');
    logger.info(`Starting Mihomo: ${executable}`);
    const child = spawn(executable, ['-d', this.workDir, '-f', this.configPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.process = child;
    this.ready = false;
    child.stdout.on('data', data => logger.info(`[Mihomo] ${data.toString().trim()}`));
    child.stderr.on('data', data => logger.warn(`[Mihomo] ${data.toString().trim()}`));
    child.on('error', error => {
      if (this.process !== child) return;
      this.ready = false;
      logger.error(`Mihomo process error: ${error.message}`);
      this.scheduleRestart(`process error: ${error.message}`);
    });
    child.on('close', code => {
      if (this.process !== child) return;
      this.process = null;
      this.ready = false;
      logger.warn(`Mihomo exited with code ${code}`);
      if (!this.stopping) this.scheduleRestart(`exit code ${code}`);
    });
    try {
      await this.waitForApi();
    } catch (error) {
      if (this.process === child) this.scheduleRestart(error.message);
      throw error;
    }
    this.ready = true;
    this.restartAttempts = 0;
    this.controllerFailures = 0;
    this.controllerFailingSince = null;
    this.startedAt = Date.now();
    this.lastConfigHash = sha256(text);
    logger.info('Mihomo core is ready');
  }

  scheduleRestart(reason) {
    if (this.stopping || this.restartTimer) return;
    this.restartAttempts += 1;
    const delay = Math.min(MAX_RESTART_DELAY_MS, 1000 * 2 ** (this.restartAttempts - 1));
    logger.warn(`Restarting Mihomo in ${delay} ms (${reason})`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start().catch(error => logger.error(`Mihomo restart failed: ${error.message}`));
    }, delay);
    this.restartTimer.unref?.();
  }

  clearRestartTimer() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  killProcess() {
    const child = this.process;
    this.process = null;
    this.ready = false;
    if (!child) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* already gone */ } }, 2000);
    force.unref?.();
  }

  stop() {
    this.stopping = true;
    this.clearRestartTimer();
    this.killProcess();
  }

  // Graceful variant for process shutdown: wait (briefly) until the child has really exited.
  async shutdown(timeoutMs = 3000) {
    this.stopping = true;
    this.clearRestartTimer();
    const child = this.process;
    this.process = null;
    this.ready = false;
    if (!child) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
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

  // Always remembers the node list (so a restarted core comes back with the right proxies), but only
  // reloads the running core when the generated config actually changed. A forced reload resets the
  // selector groups and interrupts probes in flight, so it must not happen on every refresh.
  async updateProxies(nodes) {
    this.currentNodes = nodes;
    const text = this.writeConfig(nodes);
    if (!this.ready) return [];
    const names = nodes.map(node => node.proxyName || node.name);
    const hash = sha256(text);
    if (hash === this.lastConfigHash) return names;
    await axios.put(`${this.apiUrl}/configs?force=true`, { path: this.configPath }, {
      headers: this.headers(), timeout: 10000
    });
    this.lastConfigHash = hash;
    logger.info(`Loaded ${nodes.length} nodes into Mihomo`);
    return names;
  }

  noteControllerFailure() {
    const now = Date.now();
    this.controllerFailures += 1;
    this.controllerFailingSince ||= now;
    // A controller that stays unreachable for a while while the process is "alive" is hung: restart it.
    if (this.process && this.controllerFailures >= 5 && now - this.controllerFailingSince > 15000) {
      logger.error('Mihomo controller is unresponsive, restarting the core');
      this.controllerFailures = 0;
      this.controllerFailingSince = null;
      this.killProcess();
      this.scheduleRestart('controller unresponsive');
    }
  }

  noteControllerSuccess() {
    this.controllerFailures = 0;
    this.controllerFailingSince = null;
  }

  // Result shape: { online, latency, error } or { skipped: true } when the probe could not be performed.
  // Skipped probes must never be treated as the node being offline.
  async testNode(proxyName, timeout = 8000, url) {
    if (!this.ready) return { online: null, latency: null, skipped: true, error: 'Mihomo is not ready' };
    let target = DEFAULT_PROBE_URL;
    if (url) {
      try {
        const parsed = new URL(url);
        if (['http:', 'https:'].includes(parsed.protocol)) target = parsed.toString();
      } catch (_) { /* fall back to the default probe URL */ }
    }
    try {
      const response = await axios.get(`${this.apiUrl}/proxies/${encodeURIComponent(proxyName)}/delay`, {
        headers: this.headers(), timeout: timeout + 1000,
        params: { timeout, url: target }
      });
      this.noteControllerSuccess();
      return { online: true, latency: response.data.delay };
    } catch (error) {
      if (error.response?.status === 404) {
        return { online: null, latency: null, skipped: true, error: 'Proxy is not loaded in Mihomo' };
      }
      if (!error.response && CONTROLLER_ERROR_CODES.has(error.code)) {
        this.noteControllerFailure();
        return { online: null, latency: null, skipped: true, error: `Mihomo controller unreachable: ${error.code}` };
      }
      if (error.response) this.noteControllerSuccess();
      return {
        online: false,
        latency: null,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async selectNode(proxyName, slot = 0) {
    if (!this.ready) throw new Error('Mihomo is not ready');
    const group = encodeURIComponent(this.groupName(slot));
    await axios.put(`${this.apiUrl}/proxies/${group}`, { name: proxyName }, {
      headers: this.headers(), timeout: 5000
    });
    await this.verifySelected(proxyName, slot);
  }

  // Throws when the group is no longer pointing at proxyName (for example after a config reload).
  async verifySelected(proxyName, slot = 0) {
    const group = encodeURIComponent(this.groupName(slot));
    const { data } = await axios.get(`${this.apiUrl}/proxies/${group}`, { headers: this.headers(), timeout: 5000 });
    if (data?.now !== proxyName) throw new Error('Proxy selection changed during the check');
  }

  getProxyUrl(slot = 0) {
    return `http://127.0.0.1:${this.slotPort(slot)}`;
  }

  getStatus() {
    return {
      ready: this.ready,
      running: Boolean(this.process),
      restartAttempts: this.restartAttempts,
      restartScheduled: Boolean(this.restartTimer),
      uptimeSeconds: this.ready && this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      mediaSlots: this.mediaSlots,
      nodes: this.currentNodes.length
    };
  }
}

module.exports = new MihomoService();
module.exports.GROUP_NAME = GROUP_NAME;
module.exports.DEFAULT_PROBE_URL = DEFAULT_PROBE_URL;
module.exports.MihomoService = MihomoService;
