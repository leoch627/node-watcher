const crypto = require('crypto');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const mihomoService = require('./mihomo');
const mediaService = require('./media');
const nodeParser = require('./nodeParser');
const config = require('../utils/config');
const registry = require('../probe/registry');
const logger = require('../utils/logger');

const MAX_INDIVIDUAL_ALERTS = 3;
const INCIDENT_MIN_NODES = 5;
const INCIDENT_FAIL_RATIO = 0.8;
const INCIDENT_CLEAR_RATIO = 0.5;

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

class SchedulerService {
  constructor() {
    this.timer = null;
    this.refreshTimer = null;
    this.nodes = [];
    this.sourceStatus = [];
    this.healthJob = null;
    this.mediaJob = null;
    this.lastGoodNodes = new Map();
    this.loadChain = Promise.resolve();
    this.incidents = new Map();
    this.probeDownTimers = new Map();
    this.probeAlerted = new Set();
  }

  async init() {
    try {
      await this.loadNodes();
    } catch (error) {
      logger.error(`Initial node load failed: ${error.message}`);
    }
    this.startMonitoring();
    await this.runHealthCheck();
  }

  async loadSubscription(subscription) {
    const startedAt = Date.now();
    try {
      const parsed = await subscriptionService.getNodes(subscription.url);
      const source = { id: subscription.id, name: subscription.name, type: 'subscription' };
      const nodes = nodeParser.toRuntimeNodes(parsed.proxies, source);
      this.lastGoodNodes.set(subscription.id, nodes);
      return {
        nodes,
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: true,
          nodeCount: nodes.length, durationMs: Date.now() - startedAt, errors: parsed.errors.length }
      };
    } catch (error) {
      // A subscription server hiccup must not make the subscription's nodes vanish from monitoring
      // (which would also throw away their alert state): keep serving the last good list.
      const stale = this.lastGoodNodes.get(subscription.id) || [];
      logger.warn(`Subscription "${subscription.name}" refresh failed: ${error.message}; `
        + (stale.length ? `keeping ${stale.length} nodes from the last successful fetch` : 'no previous nodes to keep'));
      return {
        nodes: stale,
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: false,
          stale: stale.length > 0, nodeCount: stale.length, durationMs: Date.now() - startedAt, error: error.message }
      };
    }
  }

  loadImport(item) {
    const parsed = subscriptionService.parseContent(item.content);
    const source = { id: item.id, name: item.name, type: 'import' };
    const nodes = nodeParser.toRuntimeNodes(parsed.proxies, source);
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

  // Loads are serialised so a scheduled refresh and a user-triggered reload never run concurrently.
  loadNodes() {
    const run = this.loadChain.then(() => this.performLoad());
    this.loadChain = run.catch(() => {});
    return run;
  }

  async performLoad() {
    const cfg = config.getConfig();
    const subscriptions = (cfg.subscriptions || []).filter(item => item.enabled !== false);
    const activeIds = new Set(subscriptions.map(item => item.id));
    for (const id of this.lastGoodNodes.keys()) if (!activeIds.has(id)) this.lastGoodNodes.delete(id);
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
    registry.syncNodes(this.nodes);
    registry.hub?.broadcastNodes(this.nodes);
    await mihomoService.updateProxies(this.nodes);
    logger.info(`Loaded ${this.nodes.length} nodes from ${allResults.length} sources`);
    return this.nodes;
  }

  startMonitoring() {
    this.stopMonitoring();
    const monitoring = config.getConfig().monitoring || {};
    const minutes = Math.max(1, Number(monitoring.checkIntervalMinutes || 5));
    const refreshMinutes = Math.max(1, Number(monitoring.subscriptionRefreshMinutes || 30));
    this.timer = setInterval(() => {
      this.runHealthCheck().catch(error => logger.error(`Scheduled health check failed: ${error.message}`));
    }, minutes * 60000);
    this.refreshTimer = setInterval(() => {
      this.loadNodes().catch(error => logger.error(`Scheduled subscription refresh failed: ${error.message}`));
    }, refreshMinutes * 60000);
    this.timer.unref?.();
    this.refreshTimer.unref?.();
    logger.info(`Health checks every ${minutes} minute(s); subscriptions refreshed every ${refreshMinutes} minute(s)`);
  }

  checkOptions() {
    const monitoring = config.getConfig().monitoring || {};
    return {
      options: {
        retries: clamp(monitoring.retryAttempts, 0, 3, 0),
        failureThreshold: clamp(monitoring.failureThreshold, 1, 10, 2),
        url: monitoring.customHealthCheckUrl || undefined
      },
      timeout: Math.max(1000, Number(monitoring.timeoutSeconds || 10) * 1000),
      concurrency: clamp(monitoring.concurrency, 1, 32, 8)
    };
  }

  // Alerts name the probe only when remote probes exist, so single-host messages stay unchanged.
  probeLabel(id) {
    if (registry.records().length === 0) return null;
    if (registry.isLocal(id)) return { id, name: registry.localName };
    const record = registry.find(id);
    return record ? { id, name: record.name } : null;
  }

  // One round on every probe: the local Mihomo core (unless LOCAL_PROBE=false) and each connected
  // remote probe, in parallel. `only` limits the round to the given probe ids.
  async runHealthCheck({ reload = false, only = null } = {}) {
    if (this.healthJob?.status === 'running') return this.healthJob;
    const job = {
      id: crypto.randomUUID(), type: 'health', status: 'running', total: this.nodes.length,
      completed: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, probes: []
    };
    this.healthJob = job;
    try {
      if (reload) await this.loadNodes();
      const settings = this.checkOptions();
      const wanted = id => !only || only.includes(id);
      const tasks = [];
      if (registry.localEnabled && wanted('local')) tasks.push(this.runLocalCheck(job, settings));
      for (const id of registry.hub?.connectedIds() || []) {
        if (wanted(id)) tasks.push(this.runRemoteCheck(job, id, settings));
      }
      job.total = this.nodes.length * Math.max(1, tasks.length);
      await Promise.all(tasks);
      if (job.probes.some(item => item.status === 'completed')) {
        job.status = 'completed';
      } else {
        // Nothing could probe: record nothing and alert on nothing.
        job.status = 'skipped';
        job.error = job.probes.map(item => item.error).find(Boolean) || 'No probe is available';
        logger.warn(`Health check skipped: ${job.error}`);
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      logger.error(`Health check failed: ${error.message}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
    return job;
  }

  progress(job) {
    job.completed = job.probes.reduce((sum, item) => sum + (item.completed || 0), 0);
  }

  async runLocalCheck(job, { options, timeout, concurrency }) {
    const entry = { id: 'local', name: registry.localName, status: 'running', completed: 0, total: this.nodes.length, error: null };
    job.probes.push(entry);
    if (!mihomoService.ready) {
      entry.status = 'skipped';
      entry.error = 'Mihomo is not ready';
      return;
    }
    try {
      const results = await monitorService.checkAll(this.nodes, timeout, concurrency,
        completed => { entry.completed = completed; this.progress(job); }, options);
      await this.dispatchAlerts(results.filter(Boolean), this.nodes.length, { probe: this.probeLabel('local') });
      entry.status = 'completed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error.message;
      logger.error(`Local health check failed: ${error.message}`);
    }
  }

  async runRemoteCheck(job, id, { options, timeout, concurrency }) {
    const record = registry.find(id);
    const monitor = registry.monitorFor(id);
    const entry = { id, name: record?.name || id, status: 'running', completed: 0, total: this.nodes.length, error: null };
    job.probes.push(entry);
    if (!record || !monitor) {
      entry.status = 'skipped';
      entry.error = 'Unknown probe';
      return;
    }
    try {
      const outcome = await registry.hub.runCheck(id, { timeout, retries: options.retries, url: options.url, concurrency });
      if (!outcome.mihomoReady) {
        entry.status = 'skipped';
        entry.error = outcome.error || 'Mihomo is not ready on the probe';
        return;
      }
      const byId = new Map(this.nodes.map(node => [node.id, node]));
      const applied = [];
      for (const result of outcome.results || []) {
        const node = byId.get(result?.id);
        if (!node) continue;
        const status = monitor.applyProbeResult(node, result, { ...options, checkMethod: 'probe' });
        if (status) applied.push(status);
      }
      entry.completed = this.nodes.length;
      this.progress(job);
      await this.dispatchAlerts(applied, this.nodes.length, { monitor, probe: this.probeLabel(id) });
      entry.status = 'completed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error.message;
      logger.warn(`Health check on probe ${entry.name} failed: ${error.message}`);
    }
  }

  // Probe connectivity alerts: a remote probe that stays disconnected for a while is reported once,
  // and its return is reported if (and only if) the disconnect was.
  watchProbes(hub) {
    hub.on('connect', probe => {
      clearTimeout(this.probeDownTimers.get(probe.id));
      this.probeDownTimers.delete(probe.id);
      if (this.probeAlerted.delete(probe.id)) {
        notificationService.dispatchAlert({
          online: true, title: '探针已恢复', subject: `[Node Watcher] 探针已恢复 - ${probe.name}`,
          message: `探针 ${probe.name} 已重新连接到主控。`
        }, `probe ${probe.name}`).catch(() => {});
      }
      // Give the probe a moment to load the node list, then check it right away.
      const timer = setTimeout(() => {
        if (this.healthJob?.status !== 'running' && hub.connectedIds().includes(probe.id)) {
          this.runHealthCheck({ only: [probe.id] }).catch(() => {});
        }
      }, 5000);
      timer.unref?.();
    });
    hub.on('disconnect', probe => {
      const minutes = Math.max(1, Number(config.getConfig().monitoring?.checkIntervalMinutes || 5));
      const grace = Math.max(3 * 60000, 2 * minutes * 60000);
      clearTimeout(this.probeDownTimers.get(probe.id));
      const timer = setTimeout(() => {
        this.probeDownTimers.delete(probe.id);
        if (hub.connectedIds().includes(probe.id) || !registry.find(probe.id)) return;
        this.probeAlerted.add(probe.id);
        notificationService.dispatchAlert({
          online: false, title: '探针离线', subject: `[Node Watcher] 探针离线 - ${probe.name}`,
          message: `探针 ${probe.name} 已断开超过 ${Math.round(grace / 60000)} 分钟，期间不再从该网络检测节点。`
        }, `probe ${probe.name}`).catch(() => {});
      }, grace);
      timer.unref?.();
      this.probeDownTimers.set(probe.id, timer);
    });
  }

  // Turns this cycle's alert events into notifications:
  //  - if (nearly) every node failed at once, send a single "monitor-side incident" message instead;
  //  - several events in one cycle are merged into one message;
  //  - alert state is only committed after a notification was dispatched, so suppressed alerts are not lost.
  async dispatchAlerts(results, totalNodes, { monitor = monitorService, probe = null } = {}) {
    const key = probe?.id || 'local';
    const probeName = probe?.name || null;
    const failing = results.filter(item => item.online === false).length;
    const failRatio = results.length ? failing / results.length : 0;
    if (totalNodes >= INCIDENT_MIN_NODES && failRatio >= INCIDENT_FAIL_RATIO) {
      if (!this.incidents.get(key)) {
        this.incidents.set(key, true);
        logger.warn(`${failing}/${totalNodes} nodes failed in one cycle${probeName ? ` on probe ${probeName}` : ''}; suppressing per-node alerts`);
        await notificationService.sendIncidentNotification({ failing, total: totalNodes }, false, probeName);
      }
      return;
    }
    if (this.incidents.get(key) && failRatio <= INCIDENT_CLEAR_RATIO) {
      this.incidents.set(key, false);
      await notificationService.sendIncidentNotification({ failing, total: totalNodes }, true, probeName);
    }
    for (const kind of ['offline', 'recovered']) {
      const entries = results.filter(item => item.alertEvent === kind).map(status => ({ node: status.node, status }));
      if (entries.length === 0) continue;
      if (entries.length > MAX_INDIVIDUAL_ALERTS) {
        await notificationService.sendBatchNotification(kind, entries, probeName);
      } else {
        await Promise.all(entries.map(({ node, status }) =>
          notificationService.sendNotification(node, { ...status, statusChanged: true, probeName })));
      }
      for (const { node } of entries) monitor.markAlertSent(node.id, kind);
    }
  }

  startMediaCheck(nodeIds = [], probeId = null) {
    if (this.mediaJob?.status === 'running') return this.mediaJob;
    const target = probeId || (registry.localEnabled ? 'local' : registry.hub?.connectedIds()[0] || 'local');
    const remote = !registry.isLocal(target);
    const selected = nodeIds.length > 0
      ? this.nodes.filter(node => nodeIds.includes(node.id))
      : this.nodes;
    const job = {
      id: crypto.randomUUID(), type: 'media', status: 'running', total: selected.length,
      completed: 0, errors: 0, skipped: 0, currentNode: null, probeId: target,
      startedAt: new Date().toISOString(), finishedAt: null, error: null
    };
    this.mediaJob = job;
    const fail = message => {
      job.status = 'failed';
      job.error = message;
      job.finishedAt = new Date().toISOString();
      return job;
    };
    if (remote) {
      if (!registry.find(target)) return fail('Unknown probe');
      if (!registry.hub?.connectedIds().includes(target)) return fail('Probe is not connected');
      this.executeRemoteMediaJob(job, target, selected).catch(error => logger.error(`Media check crashed: ${error.message}`));
      return job;
    }
    if (!registry.localEnabled) return fail('The local probe is disabled');
    if (!mihomoService.ready) return fail('Mihomo is not ready');
    this.executeMediaJob(job, selected).catch(error => logger.error(`Media check crashed: ${error.message}`));
    return job;
  }

  async executeRemoteMediaJob(job, probeId, nodes) {
    const monitor = registry.monitorFor(probeId);
    const names = new Map(nodes.map(node => [node.id, node.name]));
    // Offline nodes cannot produce meaningful results; keep whatever we had before.
    const runnable = nodes.filter(node => monitor.getNodeStatus(node)?.online !== false);
    job.skipped = nodes.length - runnable.length;
    job.completed = job.skipped;
    try {
      if (runnable.length > 0) {
        const outcome = await registry.hub.runMedia(probeId, runnable.map(node => node.id), (nodeId, media) => {
          if (!names.has(nodeId)) return;
          monitor.setMediaResult(nodeId, media);
          job.currentNode = names.get(nodeId);
          job.completed += 1;
        });
        job.errors = Number(outcome?.errors) || 0;
        if (outcome?.error) throw new Error(outcome.error);
      }
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      logger.error(`Media check on probe ${probeId} failed: ${error.message}`);
    } finally {
      job.currentNode = null;
      job.finishedAt = new Date().toISOString();
    }
  }

  async executeMediaJob(job, nodes) {
    const slots = Math.max(1, Math.min(mihomoService.mediaSlots, nodes.length));
    let cursor = 0;
    const worker = async slot => {
      while (cursor < nodes.length) {
        const node = nodes[cursor];
        cursor += 1;
        // An offline node cannot produce meaningful results; keep whatever we had before.
        if (monitorService.getNodeStatus(node)?.online === false) {
          job.skipped += 1;
          job.completed += 1;
          continue;
        }
        job.currentNode = node.name;
        try {
          const media = await mediaService.checkNode(node, slot);
          monitorService.setMediaResult(node.id, media);
        } catch (error) {
          job.errors += 1;
          const failed = { status: 'error', detail: error.message, region: null };
          monitorService.setMediaResult(node.id, {
            checkedAt: new Date().toISOString(), exit: { ip: null, region: null },
            services: Object.fromEntries(mediaService.SERVICE_KEYS.map(key => [key, failed]))
          });
        }
        job.completed += 1;
      }
    };
    try {
      await Promise.all(Array.from({ length: slots }, (_, slot) => worker(slot)));
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
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.timer = null;
    this.refreshTimer = null;
  }

  async reloadSubscriptions() { return this.loadNodes(); }

  getStatus() {
    return {
      isRunning: Boolean(this.timer), totalNodes: this.nodes.length,
      onlineNodes: monitorService.getOnlineNodes().length,
      offlineNodes: monitorService.getOfflineNodes().length,
      pendingNodes: monitorService.getPendingNodes().length,
      sourceStatus: this.sourceStatus,
      jobs: { health: this.healthJob, media: this.mediaJob },
      mihomoReady: mihomoService.ready,
      mihomo: mihomoService.getStatus(),
      probes: registry.describe()
    };
  }
}

module.exports = new SchedulerService();
module.exports.SchedulerService = SchedulerService;
