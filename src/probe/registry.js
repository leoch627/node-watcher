const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');
const monitorService = require('../services/monitor');
const { MonitorService } = require('../services/monitor');

const LOCAL_ID = 'local';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Keeps the list of probes (the master's own "local" probe plus remote probes stored in config.probes)
// and one MonitorService per probe, so status, history and alert state are tracked per network.
class ProbeRegistry {
  constructor(options = {}) {
    this.config = options.config || config;
    this.localMonitor = options.localMonitor || monitorService;
    this.dataDir = options.dataDir || path.dirname(this.localMonitor.historyPath);
    this.localEnabled = options.localEnabled ?? process.env.LOCAL_PROBE !== 'false';
    this.localName = options.localName || process.env.LOCAL_PROBE_NAME || '本机';
    this.monitors = new Map();
    this.hub = null;
    this.nodes = [];
  }

  records() {
    const cfg = this.config.getConfig();
    if (!Array.isArray(cfg.probes)) cfg.probes = [];
    return cfg.probes;
  }

  find(id) {
    return this.records().find(item => item.id === id) || null;
  }

  isLocal(id) {
    return id === LOCAL_ID;
  }

  historyPathFor(id) {
    return path.join(this.dataDir, `history-${id}.json`);
  }

  monitorFor(id) {
    if (id === LOCAL_ID || !id) return this.localMonitor;
    if (!this.find(id)) return null;
    if (!this.monitors.has(id)) {
      const monitor = new MonitorService({ historyPath: this.historyPathFor(id) });
      monitor.syncNodes(this.nodes);
      this.monitors.set(id, monitor);
    }
    return this.monitors.get(id);
  }

  // Probes shown in the UI / API. The local probe is listed only when it is enabled.
  list() {
    const items = [];
    if (this.localEnabled) items.push({ id: LOCAL_ID, name: this.localName, type: 'local', enabled: true });
    for (const record of this.records()) {
      items.push({ id: record.id, name: record.name, type: 'remote', enabled: record.enabled !== false, createdAt: record.createdAt });
    }
    return items;
  }

  defaultProbeId() {
    return this.list()[0]?.id || LOCAL_ID;
  }

  create(name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) throw new Error('Probe name is required');
    const id = `p-${crypto.randomBytes(4).toString('hex')}`;
    const token = crypto.randomBytes(24).toString('base64url');
    this.records().push({ id, name: clean, tokenHash: hashToken(token), enabled: true, createdAt: new Date().toISOString() });
    if (!this.config.saveConfig()) throw new Error('Could not save configuration');
    return { probe: this.find(id), token };
  }

  rotateToken(id) {
    const record = this.find(id);
    if (!record) return null;
    const token = crypto.randomBytes(24).toString('base64url');
    record.tokenHash = hashToken(token);
    this.config.saveConfig();
    this.hub?.disconnect(id, 'Token rotated');
    return token;
  }

  update(id, { name, enabled } = {}) {
    const record = this.find(id);
    if (!record) return null;
    if (typeof name === 'string' && name.trim()) record.name = name.trim().slice(0, 40);
    if (typeof enabled === 'boolean') record.enabled = enabled;
    this.config.saveConfig();
    if (record.enabled === false) this.hub?.disconnect(id, 'Probe disabled');
    return record;
  }

  remove(id) {
    const records = this.records();
    const index = records.findIndex(item => item.id === id);
    if (index < 0) return false;
    records.splice(index, 1);
    this.config.saveConfig();
    this.hub?.disconnect(id, 'Probe removed');
    const monitor = this.monitors.get(id);
    if (monitor?.saveTimer) clearTimeout(monitor.saveTimer);
    this.monitors.delete(id);
    try { fs.rmSync(this.historyPathFor(id), { force: true }); } catch (error) {
      logger.warn(`Could not remove history of probe ${id}: ${error.message}`);
    }
    return true;
  }

  // Constant-time token check. Returns the probe record, or null.
  authenticate(id, token) {
    const record = this.find(String(id || ''));
    const expected = Buffer.from(record?.tokenHash || hashToken(crypto.randomBytes(16)), 'hex');
    const actual = Buffer.from(hashToken(token || ''), 'hex');
    const ok = crypto.timingSafeEqual(expected, actual);
    if (!record || !ok || record.enabled === false) return null;
    return record;
  }

  syncNodes(nodes) {
    this.nodes = nodes;
    this.localMonitor.syncNodes(nodes);
    for (const monitor of this.monitors.values()) monitor.syncNodes(nodes);
  }

  flushAll() {
    this.localMonitor.flushSync();
    for (const monitor of this.monitors.values()) monitor.flushSync();
  }

  // Per-probe summary of one node, for the cross-probe comparison column.
  nodeAcrossProbes(nodeId) {
    return this.list().map(probe => {
      const status = this.monitorFor(probe.id)?.getNodeStatus(nodeId);
      return {
        id: probe.id, name: probe.name,
        online: status?.online ?? null,
        responseTime: status?.responseTime ?? null,
        lastCheck: status?.lastCheck ?? null
      };
    });
  }

  describe() {
    return this.list().map(probe => {
      const monitor = this.monitorFor(probe.id);
      const statuses = monitor ? monitor.getAllStatus() : [];
      const summary = {
        online: statuses.filter(item => item.online === true).length,
        offline: statuses.filter(item => item.online === false).length,
        pending: statuses.filter(item => item.online == null).length
      };
      const session = probe.type === 'remote' ? this.hub?.sessionInfo(probe.id) : null;
      return {
        ...probe,
        summary,
        connected: probe.type === 'local' ? true : Boolean(session),
        session,
        lastSeen: probe.type === 'remote' ? (session?.lastSeen || this.hub?.lastSeen.get(probe.id) || null) : null
      };
    });
  }
}

const registry = new ProbeRegistry();
module.exports = registry;
module.exports.ProbeRegistry = ProbeRegistry;
module.exports.LOCAL_ID = LOCAL_ID;
module.exports.hashToken = hashToken;
