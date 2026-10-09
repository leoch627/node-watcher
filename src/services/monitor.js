const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const prober = require('./prober');
const { writeFileAtomic } = require('../utils/atomicWrite');

const HOUR = 3600000;
const RETENTION_MS = 31 * 24 * HOUR;
const SAVE_DEBOUNCE_MS = 2000;

class MonitorService {
  constructor(options = {}) {
    this.nodeStatus = new Map();
    // nodeId -> { firstCheck, buckets: { "<hour start ms>": [onlineChecks, totalChecks] } }
    this.nodeHistory = new Map();
    this.historyPath = options.historyPath || process.env.HISTORY_FILE || path.join(process.cwd(), 'data', 'history.json');
    this.saveTimer = null;
    this.loadHistory();
  }

  // ---- history (hourly buckets; ~744 small entries per node for 31 days regardless of check frequency) ----

  loadHistory() {
    let raw;
    try {
      if (!fs.existsSync(this.historyPath)) return;
      raw = fs.readFileSync(this.historyPath, 'utf8');
      const data = JSON.parse(raw);
      const current = data && data.version === 2;
      const source = current ? data.nodes : data;
      const loaded = new Map();
      for (const [id, entry] of Object.entries(source || {})) {
        const history = entry && entry.buckets
          ? { firstCheck: entry.firstCheck || null, buckets: { ...entry.buckets } }
          : this.migrateLegacyEntry(entry);
        if (history) loaded.set(id, history);
      }
      this.nodeHistory = loaded;
      this.pruneHistory();
      if (!current) {
        // Keep the old per-check file once, then persist the new compact format.
        try { fs.copyFileSync(this.historyPath, `${this.historyPath}.v1.bak`); } catch (_) { /* best effort */ }
        this.scheduleSave();
      }
    } catch (error) {
      logger.warn(`Could not load history: ${error.message}`);
      if (raw !== undefined) {
        try { fs.renameSync(this.historyPath, `${this.historyPath}.corrupt-${Date.now()}`); } catch (_) { /* best effort */ }
      }
    }
  }

  migrateLegacyEntry(entry) {
    if (!entry || !Array.isArray(entry.checks)) return null;
    const buckets = {};
    for (const check of entry.checks) {
      const time = new Date(check?.timestamp).getTime();
      if (!Number.isFinite(time)) continue;
      const key = String(Math.floor(time / HOUR) * HOUR);
      const bucket = buckets[key] || (buckets[key] = [0, 0]);
      if (check.online) bucket[0] += 1;
      bucket[1] += 1;
    }
    return { firstCheck: entry.firstCheck || null, buckets };
  }

  pruneHistory(now = Date.now()) {
    const cutoff = Math.floor((now - RETENTION_MS) / HOUR) * HOUR;
    for (const [id, history] of this.nodeHistory) {
      for (const key of Object.keys(history.buckets)) {
        if (Number(key) < cutoff) delete history.buckets[key];
      }
      // Entries that no longer receive checks (renamed or removed nodes) disappear once they age out.
      if (Object.keys(history.buckets).length === 0) this.nodeHistory.delete(id);
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      this.pruneHistory();
      writeFileAtomic(this.historyPath, JSON.stringify({ version: 2, nodes: Object.fromEntries(this.nodeHistory) }));
    } catch (error) {
      logger.warn(`Could not save history: ${error.message}`);
    }
  }

  // Called on shutdown so a pending debounced save is not lost.
  flushSync() {
    if (this.saveTimer) this.saveNow();
  }

  recordHistory(node, online, now = Date.now()) {
    const history = this.nodeHistory.get(node.id) || { firstCheck: new Date(now).toISOString(), buckets: {} };
    const key = String(Math.floor(now / HOUR) * HOUR);
    const bucket = history.buckets[key] || (history.buckets[key] = [0, 0]);
    if (online) bucket[0] += 1;
    bucket[1] += 1;
    this.nodeHistory.set(node.id, history);
    this.scheduleSave();
  }

  calculateUptime(nodeId, hours, now = Date.now()) {
    const history = this.nodeHistory.get(nodeId);
    if (!history) return null;
    const cutoff = Math.floor((now - hours * HOUR) / HOUR) * HOUR;
    let onlineChecks = 0;
    let totalChecks = 0;
    for (const [key, [ok, total]] of Object.entries(history.buckets)) {
      if (Number(key) >= cutoff) {
        onlineChecks += ok;
        totalChecks += total;
      }
    }
    if (totalChecks === 0) return null;
    return {
      uptimePercentage: Math.round((onlineChecks / totalChecks) * 10000) / 100,
      totalChecks,
      onlineChecks,
      offlineChecks: totalChecks - onlineChecks,
      period: `${hours}h`
    };
  }

  // ---- probing ----

  publicNode(node) {
    const { proxy, ...safe } = node;
    return safe;
  }

  // Returns the updated status, or null when monitoring itself was unavailable (Mihomo not ready,
  // proxy not loaded). Those probes say nothing about the node, so they must not touch state or history.
  async checkNode(node, timeout = 10000, options = {}) {
    const retries = Math.max(0, Math.min(3, Number(options.retries) || 0));
    const result = await prober.probeNode(node, timeout, { url: options.url, retries });
    return this.applyProbeResult(node, result, options);
  }

  // Records one probe result (local or reported by a remote probe).
  applyProbeResult(node, result, options = {}) {
    if (!result || result.skipped || typeof result.online !== 'boolean') return null;
    const status = {
      online: result.online,
      responseTime: Number.isFinite(result.latency) ? result.latency : null,
      lastCheck: result.lastCheck || new Date().toISOString(),
      error: result.error || null,
      checkMethod: options.checkMethod || 'mihomo'
    };
    const updated = this.updateNodeStatus(node, status, options);
    this.recordHistory(node, result.online);
    return updated;
  }

  async checkAll(nodes, timeout = 10000, concurrency = 8, onProgress, options = {}) {
    const results = new Array(nodes.length);
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (cursor < nodes.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await this.checkNode(nodes[index], timeout, options);
        } catch (error) {
          results[index] = this.updateNodeStatus(nodes[index], {
            online: false, responseTime: null, lastCheck: new Date().toISOString(),
            error: error.message, checkMethod: 'mihomo-error'
          }, options);
        }
        completed += 1;
        if (onProgress) onProgress(completed, nodes.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
    return results;
  }

  // ---- status & alert state ----
  //
  // statusChanged   : raw online/offline flip, used for display (unchanged semantics).
  // alertEvent      : 'offline' once a node has failed `failureThreshold` consecutive checks,
  //                   'recovered' once it is back after an offline alert was actually sent.
  //                   The scheduler commits alert state with markAlertSent(), so alerts that are
  //                   suppressed (e.g. during a monitor-side outage) are not lost.
  updateNodeStatus(node, status, options = {}) {
    const threshold = Math.max(1, Number(options.failureThreshold) || 1);
    const previous = this.nodeStatus.get(node.id);
    const online = status.online;
    const consecutiveFailures = online === false ? (previous?.consecutiveFailures || 0) + 1 : 0;
    const confirmedDown = online === false && consecutiveFailures >= threshold;
    const seenOnline = online === true || previous?.seenOnline === true;
    const offlineAlertSent = previous?.offlineAlertSent === true;
    let alertEvent = null;
    if (confirmedDown && !offlineAlertSent && seenOnline) alertEvent = 'offline';
    else if (online === true && offlineAlertSent) alertEvent = 'recovered';
    const value = {
      node: this.publicNode(node),
      ...status,
      media: previous?.media || null,
      statusChanged: typeof previous?.online === 'boolean' && previous.online !== status.online,
      previousStatus: previous?.online ?? null,
      consecutiveFailures,
      confirmedDown,
      seenOnline,
      offlineAlertSent,
      alertEvent
    };
    this.nodeStatus.set(node.id, value);
    if (value.statusChanged) logger.info(`${node.name}: ${value.online ? 'online' : 'offline'}`);
    return value;
  }

  markAlertSent(nodeId, event) {
    const status = this.nodeStatus.get(nodeId);
    if (!status) return;
    this.nodeStatus.set(nodeId, { ...status, offlineAlertSent: event === 'offline', alertEvent: null });
  }

  // Keep the last good result for a service when the latest attempt only produced an error.
  mergeMedia(previous, next) {
    if (!next?.services) return next;
    if (!previous?.services) return next;
    const services = { ...next.services };
    for (const [key, value] of Object.entries(next.services)) {
      const old = previous.services[key];
      if (value?.status === 'error' && old && old.status !== 'error') {
        services[key] = { ...old, stale: true, staleSince: old.staleSince || previous.checkedAt || null, lastError: value.detail };
      }
    }
    // A placeholder result (whole-node failure) has no `regional` key: keep what we had.
    let regional = next.regional === undefined ? (previous.regional || null) : next.regional;
    if (next.regional && previous.regional?.region === regional.region) {
      const merged = { ...regional.services };
      for (const [key, value] of Object.entries(regional.services)) {
        const old = previous.regional.services?.[key];
        if (value?.status === 'error' && old && old.status !== 'error') {
          merged[key] = { ...old, stale: true, staleSince: old.staleSince || previous.checkedAt || null, lastError: value.detail };
        }
      }
      regional = { ...regional, services: merged };
    }
    return {
      ...next,
      exit: next.exit?.ip ? next.exit : (previous.exit || next.exit),
      claimedRegion: next.claimedRegion ?? previous.claimedRegion ?? null,
      regionMismatch: next.regionMismatch ?? previous.regionMismatch ?? false,
      services,
      regional
    };
  }

  setMediaResult(nodeId, media) {
    const status = this.nodeStatus.get(nodeId);
    if (status) this.nodeStatus.set(nodeId, { ...status, media: this.mergeMedia(status.media, media) });
  }

  getNodeStatus(nodeOrId) {
    return this.nodeStatus.get(typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id);
  }

  getAllStatus() { return Array.from(this.nodeStatus.values()); }
  getOfflineNodes() { return this.getAllStatus().filter(status => status.online === false); }
  getOnlineNodes() { return this.getAllStatus().filter(status => status.online === true); }
  getPendingNodes() { return this.getAllStatus().filter(status => status.online == null); }

  getPublicStats() {
    return this.getAllStatus().map(status => ({
      ...status,
      uptime: {
        '24h': this.calculateUptime(status.node.id, 24),
        '7d': this.calculateUptime(status.node.id, 168),
        '30d': this.calculateUptime(status.node.id, 720)
      }
    }));
  }

  syncNodes(nodes) {
    const ids = new Set(nodes.map(node => node.id));
    for (const id of this.nodeStatus.keys()) if (!ids.has(id)) this.nodeStatus.delete(id);
    for (const node of nodes) {
      const previous = this.nodeStatus.get(node.id);
      if (previous) {
        this.nodeStatus.set(node.id, { ...previous, node: this.publicNode(node) });
        continue;
      }
      this.nodeStatus.set(node.id, {
        node: this.publicNode(node),
        online: null,
        responseTime: null,
        lastCheck: null,
        error: null,
        checkMethod: null,
        media: null,
        statusChanged: false,
        previousStatus: null,
        consecutiveFailures: 0,
        confirmedDown: false,
        seenOnline: false,
        offlineAlertSent: false,
        alertEvent: null
      });
    }
  }
}

module.exports = new MonitorService();
module.exports.MonitorService = MonitorService;
