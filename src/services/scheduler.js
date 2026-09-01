const crypto = require('crypto');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const mihomoService = require('./mihomo');
const mediaService = require('./media');
const nodeParser = require('./nodeParser');
const config = require('../utils/config');
const logger = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.timer = null;
    this.nodes = [];
    this.sourceStatus = [];
    this.healthJob = null;
    this.mediaJob = null;
  }

  async init() {
    await this.loadNodes();
    this.startMonitoring();
    await this.runHealthCheck();
  }

  async loadSubscription(subscription) {
    const startedAt = Date.now();
    try {
      const parsed = await subscriptionService.getNodes(subscription.url);
      const source = { id: subscription.id, name: subscription.name, type: 'subscription' };
      const nodes = parsed.proxies.map(proxy => nodeParser.toRuntimeNode(proxy, source)).filter(Boolean);
      return {
        nodes,
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: true,
          nodeCount: nodes.length, durationMs: Date.now() - startedAt, errors: parsed.errors.length }
      };
    } catch (error) {
      return {
        nodes: [],
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: false,
          nodeCount: 0, durationMs: Date.now() - startedAt, error: error.message }
      };
    }
  }

  loadImport(item) {
    const parsed = subscriptionService.parseContent(item.content);
    const source = { id: item.id, name: item.name, type: 'import' };
    const nodes = parsed.proxies.map(proxy => nodeParser.toRuntimeNode(proxy, source)).filter(Boolean);
    return {
      nodes,
      status: { id: item.id, name: item.name, type: 'import', ok: nodes.length > 0,
        nodeCount: nodes.length, errors: parsed.errors.length,
        error: nodes.length === 0 ? parsed.errors[0]?.error || 'No supported nodes' : undefined }
    };
  }

  loadLegacyManual(node) {
    const type = node.protocol === 'shadowsocks' ? 'ss' : node.protocol;
    const proxy = {
      type, server: node.server || node.address, port: Number(node.port), name: node.name,
      uuid: node.uuid || (type === 'vless' || type === 'vmess' ? node.id : undefined),
      password: node.password, cipher: node.method || node.cipher,
      alterId: Number(node.alterId || 0), network: node.network || 'tcp', udp: true
    };
    return nodeParser.toRuntimeNode(proxy, { id: node.id, name: '手动节点', type: 'manual' });
  }

  async loadNodes() {
    const cfg = config.getConfig();
    const subscriptions = (cfg.subscriptions || []).filter(item => item.enabled !== false);
    const subscriptionResults = await Promise.all(subscriptions.map(item => this.loadSubscription(item)));
    const importResults = (cfg.imports || []).filter(item => item.enabled !== false).map(item => this.loadImport(item));
    const manualNodes = (cfg.manualNodes || []).filter(item => item.enabled !== false)
      .map(item => this.loadLegacyManual(item)).filter(Boolean);
    const allResults = [...subscriptionResults, ...importResults];
    const allNodes = [...allResults.flatMap(item => item.nodes), ...manualNodes];
    const excluded = new Set(cfg.excludeNodes || []);
    const unique = new Map();
    for (const node of allNodes) {
      if (excluded.has(node.id) || excluded.has(node.name)) continue;
      unique.set(node.id, node);
    }
    this.nodes = Array.from(unique.values());
    this.sourceStatus = allResults.map(item => item.status);
    monitorService.retainNodes(this.nodes);
    await mihomoService.updateProxies(this.nodes);
    logger.info(`Loaded ${this.nodes.length} nodes from ${allResults.length} sources`);
    return this.nodes;
  }

  startMonitoring() {
    this.stopMonitoring();
    const minutes = Math.max(1, Number(config.getConfig().monitoring?.checkIntervalMinutes || 5));
    this.timer = setInterval(() => this.runHealthCheck({ reload: true }), minutes * 60000);
    this.timer.unref?.();
    logger.info(`Health checks scheduled every ${minutes} minute(s)`);
  }

  async runHealthCheck({ reload = false } = {}) {
    if (this.healthJob?.status === 'running') return this.healthJob;
    if (reload) await this.loadNodes();
    const job = {
      id: crypto.randomUUID(), type: 'health', status: 'running', total: this.nodes.length,
      completed: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null
    };
    this.healthJob = job;
    try {
      const timeout = Math.max(1000, Number(config.getConfig().monitoring?.timeoutSeconds || 10) * 1000);
      const concurrency = Math.max(1, Math.min(32, Number(config.getConfig().monitoring?.concurrency || 8)));
      const results = await monitorService.checkAll(this.nodes, timeout, concurrency,
        completed => { job.completed = completed; });
      for (const result of results) {
        if (result?.statusChanged && !result.online) {
          await notificationService.sendNotification(result.node, result);
        }
      }
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      logger.error(`Health check failed: ${error.message}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
    return job;
  }

  startMediaCheck(nodeIds = []) {
    if (this.mediaJob?.status === 'running') return this.mediaJob;
    const selected = nodeIds.length > 0
      ? this.nodes.filter(node => nodeIds.includes(node.id))
      : this.nodes;
    const job = {
      id: crypto.randomUUID(), type: 'media', status: 'running', total: selected.length,
      completed: 0, errors: 0, currentNode: null, startedAt: new Date().toISOString(), finishedAt: null, error: null
    };
    this.mediaJob = job;
    this.executeMediaJob(job, selected);
    return job;
  }

  async executeMediaJob(job, nodes) {
    try {
      for (const node of nodes) {
        job.currentNode = node.name;
        try {
          const media = await mediaService.checkNode(node);
          monitorService.setMediaResult(node.id, media);
        } catch (error) {
          job.errors += 1;
          const failed = { status: 'error', detail: error.message, region: null };
          monitorService.setMediaResult(node.id, {
            checkedAt: new Date().toISOString(), exit: { ip: null, region: null },
            services: { netflix: failed, youtube: failed, disney: failed, primeVideo: failed, chatgpt: failed }
          });
        }
        job.completed += 1;
      }
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      logger.error(`Media check failed: ${error.message}`);
    } finally {
      job.currentNode = null;
      job.finishedAt = new Date().toISOString();
    }
  }

  stopMonitoring() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async reloadSubscriptions() { return this.loadNodes(); }

  getStatus() {
    return {
      isRunning: Boolean(this.timer), totalNodes: this.nodes.length,
      onlineNodes: monitorService.getOnlineNodes().length,
      offlineNodes: monitorService.getOfflineNodes().length,
      sourceStatus: this.sourceStatus,
      jobs: { health: this.healthJob, media: this.mediaJob },
      mihomoReady: mihomoService.ready
    };
  }
}

module.exports = new SchedulerService();
