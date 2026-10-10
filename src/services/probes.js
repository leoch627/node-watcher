// Probes are miaospeed backends (local / forward / reverse). Each one keeps its own node status,
// uptime history and alert state, so the same nodes can be compared across networks.
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const monitorService = require('./monitor');
const { MonitorService } = require('./monitor');
const backends = require('../miaospeed/backends');

const LOCAL_ID = backends.LOCAL_ID;

class ProbeRegistry {
  constructor(options = {}) {
    this.backends = options.backends || backends;
    this.localMonitor = options.localMonitor || monitorService;
    this.dataDir = options.dataDir || path.dirname(this.localMonitor.historyPath);
    this.monitors = new Map();
    this.nodes = [];
  }

  list() {
    return this.backends.list();
  }

  find(id) {
    return this.list().find(item => item.id === id) || null;
  }

  isLocal(id) {
    return id === LOCAL_ID;
  }

  defaultProbeId() {
    const items = this.list().filter(item => item.enabled);
    return (items.find(item => item.online) || items[0])?.id || LOCAL_ID;
  }

  historyPathFor(id) {
    return path.join(this.dataDir, `history-${id}.json`);
  }

  // The local backend keeps the original history file, so upgrades keep their uptime data.
  monitorFor(id) {
    if (!id || id === LOCAL_ID) return this.localMonitor;
    if (!this.backends.find(id)) return null;
    if (!this.monitors.has(id)) {
      const monitor = new MonitorService({ historyPath: this.historyPathFor(id) });
      monitor.syncNodes(this.nodes);
      this.monitors.set(id, monitor);
    }
    return this.monitors.get(id);
  }

  // Called after a backend was deleted: drop its state and history.
  forget(id) {
    const monitor = this.monitors.get(id);
    if (monitor?.saveTimer) clearTimeout(monitor.saveTimer);
    this.monitors.delete(id);
    try { fs.rmSync(this.historyPathFor(id), { force: true }); } catch (error) {
      logger.warn(`Could not remove history of probe ${id}: ${error.message}`);
    }
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
    return this.list().filter(item => item.enabled).map(probe => {
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
      return {
        ...probe,
        summary: {
          online: statuses.filter(item => item.online === true).length,
          offline: statuses.filter(item => item.online === false).length,
          pending: statuses.filter(item => item.online == null).length
        }
      };
    });
  }
}

const registry = new ProbeRegistry();
module.exports = registry;
module.exports.ProbeRegistry = ProbeRegistry;
module.exports.LOCAL_ID = LOCAL_ID;
