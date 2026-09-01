const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const mihomoService = require('./mihomo');

class MonitorService {
  constructor() {
    this.nodeStatus = new Map();
    this.nodeHistory = new Map();
    this.historyPath = path.join(process.cwd(), 'data', 'history.json');
    this.saveTimer = null;
    this.loadHistory();
  }

  loadHistory() {
    try {
      if (!fs.existsSync(this.historyPath)) return;
      const data = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
      this.nodeHistory = new Map(Object.entries(data));
    } catch (error) {
      logger.warn(`Could not load history: ${error.message}`);
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.historyPath), { recursive: true });
        fs.writeFileSync(this.historyPath, JSON.stringify(Object.fromEntries(this.nodeHistory)));
      } catch (error) {
        logger.warn(`Could not save history: ${error.message}`);
      }
    }, 500);
  }

  publicNode(node) {
    const { proxy, ...safe } = node;
    return safe;
  }

  async checkNode(node, timeout = 10000) {
    const result = await mihomoService.testNode(node.proxyName || node.name, timeout);
    const status = {
      online: result.online,
      responseTime: result.latency,
      lastCheck: new Date().toISOString(),
      error: result.error || null,
      checkMethod: 'mihomo'
    };
    const updated = this.updateNodeStatus(node, status);
    this.recordHistory(node, result.online);
    return updated;
  }

  async checkAll(nodes, timeout = 10000, concurrency = 8, onProgress) {
    const results = new Array(nodes.length);
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (cursor < nodes.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await this.checkNode(nodes[index], timeout);
        } catch (error) {
          results[index] = this.updateNodeStatus(nodes[index], {
            online: false, responseTime: null, lastCheck: new Date().toISOString(),
            error: error.message, checkMethod: 'mihomo-error'
          });
        }
        completed += 1;
        if (onProgress) onProgress(completed, nodes.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
    return results;
  }

  recordHistory(node, online) {
    const history = this.nodeHistory.get(node.id) || { checks: [], firstCheck: new Date().toISOString() };
    history.checks.push({ timestamp: new Date().toISOString(), online });
    history.checks = history.checks.filter(item => Date.now() - new Date(item.timestamp).getTime() < 31 * 86400000);
    if (history.checks.length > 10000) history.checks = history.checks.slice(-10000);
    this.nodeHistory.set(node.id, history);
    this.scheduleSave();
  }

  calculateUptime(nodeId, hours) {
    const checks = (this.nodeHistory.get(nodeId)?.checks || [])
      .filter(item => Date.now() - new Date(item.timestamp).getTime() <= hours * 3600000);
    if (checks.length === 0) return null;
    const onlineChecks = checks.filter(item => item.online).length;
    return {
      uptimePercentage: Math.round((onlineChecks / checks.length) * 10000) / 100,
      totalChecks: checks.length,
      onlineChecks,
      offlineChecks: checks.length - onlineChecks,
      period: `${hours}h`
    };
  }

  updateNodeStatus(node, status) {
    const previous = this.nodeStatus.get(node.id);
    const value = {
      node: this.publicNode(node),
      ...status,
      media: previous?.media || null,
      statusChanged: Boolean(previous && previous.online !== status.online),
      previousStatus: previous?.online ?? null
    };
    this.nodeStatus.set(node.id, value);
    if (value.statusChanged) logger.info(`${node.name}: ${value.online ? 'online' : 'offline'}`);
    return value;
  }

  setMediaResult(nodeId, media) {
    const status = this.nodeStatus.get(nodeId);
    if (status) this.nodeStatus.set(nodeId, { ...status, media });
  }

  getNodeStatus(nodeOrId) {
    return this.nodeStatus.get(typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id);
  }

  getAllStatus() { return Array.from(this.nodeStatus.values()); }
  getOfflineNodes() { return this.getAllStatus().filter(status => !status.online); }
  getOnlineNodes() { return this.getAllStatus().filter(status => status.online); }

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

  retainNodes(nodes) {
    const ids = new Set(nodes.map(node => node.id));
    for (const id of this.nodeStatus.keys()) if (!ids.has(id)) this.nodeStatus.delete(id);
  }
}

module.exports = new MonitorService();
