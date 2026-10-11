const crypto = require('crypto');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const nodeParser = require('./nodeParser');
const config = require('../utils/config');
const registry = require('./probes');
const backends = require('../miaospeed/backends');
const scripts = require('../miaospeed/scripts');
const { runForNodes } = require('../miaospeed/tasks');
const { MATRIX } = require('../miaospeed/protocol');
const logger = require('../utils/logger');

const MAX_INDIVIDUAL_ALERTS = 3;
const INCIDENT_MIN_NODES = 5;
const INCIDENT_FAIL_RATIO = 0.8;
const INCIDENT_CLEAR_RATIO = 0.5;
// miaospeed accepts per-request timeouts up to 10 s.
const MAX_TASK_TIMEOUT_MS = 10000;

// True when at least one notification channel reported a successful delivery.
const delivered = outcome => Array.isArray(outcome) && outcome.some(item => item && item.success === true);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

class SchedulerService {
  constructor({ probes = registry, manager = backends, run = runForNodes } = {}) {
    this.registry = probes;
    this.backends = manager;
    this.run = run;
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
    this.watchProbes(this.backends);
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
    this.registry.syncNodes(this.nodes);
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
    const retries = clamp(monitoring.retryAttempts, 0, 3, 0);
    const timeout = Math.min(MAX_TASK_TIMEOUT_MS, Math.max(1000, Number(monitoring.timeoutSeconds || 10) * 1000));
    return {
      options: { retries, failureThreshold: clamp(monitoring.failureThreshold, 1, 10, 2) },
      // HTTP delay (connection + request through the proxy) decides online/offline; RTT is extra.
      configs: {
        pingAddress: monitoring.customHealthCheckUrl || undefined,
        taskTimeout: timeout, taskRetry: retries + 1, pingAverageOver: 1
      },
      timeoutMs: Math.max(120000, Math.ceil(this.nodes.length / 32) * timeout * (retries + 2) + 60000)
    };
  }

  // Alerts name the probe only when several probes exist, so single-host messages stay unchanged.
  probeLabel(id) {
    if (this.registry.list().length < 2) return null;
    const probe = this.registry.find(id);
    return probe ? { id, name: probe.name } : null;
  }

  // One round on every enabled probe (miaospeed backend), in parallel. `only` limits the round to
  // the given probe ids. Probes that are offline are skipped, never recorded as node failures.
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
      const probes = this.registry.list().filter(probe => probe.enabled && (!only || only.includes(probe.id)));
      job.total = this.nodes.length * Math.max(1, probes.length);
      await Promise.all(probes.map(probe => this.runProbeCheck(job, probe, settings)));
      if (job.probes.some(item => item.status === 'completed')) {
        job.status = 'completed';
      } else {
        // Nothing could probe: record nothing and alert on nothing.
        job.status = 'skipped';
        job.error = job.probes.map(item => item.error).find(Boolean) || '没有可用的 miaospeed 后端';
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

  async runProbeCheck(job, probe, { options, configs, timeoutMs }) {
    const monitor = this.registry.monitorFor(probe.id);
    const entry = { id: probe.id, name: probe.name, status: 'running', completed: 0, total: this.nodes.length, error: null };
    job.probes.push(entry);
    if (!monitor || probe.online === false || (probe.type === 'reverse' && !probe.online)) {
      entry.status = 'skipped';
      entry.error = `后端 ${probe.name} 不在线`;
      return;
    }
    const nodes = this.nodes;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const applied = [];
    try {
      await this.run(probe.id, nodes, {
        matrices: [MATRIX.HTTP, MATRIX.RTT], configs, timeoutMs, manager: this.backends,
        onResult: (nodeId, result) => {
          const node = byId.get(nodeId);
          if (!node) return;
          const online = Number(result.http) > 0;
          const status = monitor.applyProbeResult(node, {
            online, latency: online ? result.http : null, rtt: result.rtt > 0 ? result.rtt : null,
            error: online ? null : '连接超时或失败'
          }, { ...options, checkMethod: 'miaospeed' });
          if (status) applied.push(status);
          entry.completed += 1;
          this.progress(job);
        }
      });
      await this.dispatchAlerts(applied, nodes.length, { monitor, probe: this.probeLabel(probe.id) });
      entry.status = 'completed';
    } catch (error) {
      entry.status = applied.length ? 'completed' : 'failed';
      entry.error = error.message;
      logger.warn(`Health check on ${probe.name} failed: ${error.message}`);
      if (applied.length) await this.dispatchAlerts(applied, nodes.length, { monitor, probe: this.probeLabel(probe.id) });
    }
  }

  // Probe connectivity alerts: a backend that stays unreachable for a while is reported once, and
  // its return is reported if (and only if) the outage was.
  watchProbes(emitter) {
    if (this.watching === emitter) return;
    this.watching = emitter;
    emitter.on('connect', probe => {
      clearTimeout(this.probeDownTimers.get(probe.id));
      this.probeDownTimers.delete(probe.id);
      if (this.probeAlerted.delete(probe.id)) {
        notificationService.dispatchAlert({
          online: true, title: '探针已恢复', subject: `[Node Watcher] 探针已恢复 - ${probe.name}`,
          message: `探针（miaospeed 后端）${probe.name} 已重新连接。`
        }, `probe ${probe.name}`).catch(() => {});
      }
      // Check the nodes from the returning probe right away.
      const timer = setTimeout(() => {
        if (this.healthJob?.status !== 'running') this.runHealthCheck({ only: [probe.id] }).catch(() => {});
      }, 3000);
      timer.unref?.();
    });
    emitter.on('disconnect', probe => {
      const minutes = Math.max(1, Number(config.getConfig().monitoring?.checkIntervalMinutes || 5));
      const grace = Math.max(3 * 60000, 2 * minutes * 60000);
      clearTimeout(this.probeDownTimers.get(probe.id));
      const timer = setTimeout(() => {
        this.probeDownTimers.delete(probe.id);
        const current = this.registry.find(probe.id);
        if (!current || current.online || !current.enabled) return;
        notificationService.dispatchAlert({
          online: false, title: '探针离线', subject: `[Node Watcher] 探针离线 - ${probe.name}`,
          message: `探针（miaospeed 后端）${probe.name} 已断开超过 ${Math.round(grace / 60000)} 分钟，期间不再从该网络检测节点。`
        }, `probe ${probe.name}`).then(outcome => {
          // Only a delivered "offline" message earns a "recovered" message later.
          if (delivered(outcome)) this.probeAlerted.add(probe.id);
        }).catch(() => {});
      }, grace);
      timer.unref?.();
      this.probeDownTimers.set(probe.id, timer);
    });
  }

  // Turns this cycle's alert events into notifications:
  //  - if (nearly) every node failed at once, send a single "monitor-side incident" message instead;
  //  - several events in one cycle are merged into one message;
  //  - alert state (offline alert sent, incident active) only changes once at least one channel
  //    actually delivered the message: channel failures are returned as { success: false } rather
  //    than thrown, and with every channel down (or none enabled yet) the event must stay pending so
  //    it is retried on the next cycle.
  async dispatchAlerts(results, totalNodes, { monitor = monitorService, probe = null } = {}) {
    const key = probe?.id || 'local';
    const probeName = probe?.name || null;
    const failing = results.filter(item => item.online === false).length;
    // Fraction of *all* nodes, not of the results that came back: skipped probes must not turn a
    // single failure into an apparent outage.
    const failRatio = totalNodes > 0 ? failing / totalNodes : 0;
    if (totalNodes >= INCIDENT_MIN_NODES && failRatio >= INCIDENT_FAIL_RATIO) {
      if (!this.incidents.get(key)) {
        logger.warn(`${failing}/${totalNodes} nodes failed in one cycle${probeName ? ` on probe ${probeName}` : ''}; suppressing per-node alerts`);
        const outcome = await notificationService.sendIncidentNotification({ failing, total: totalNodes }, false, probeName);
        if (delivered(outcome)) this.incidents.set(key, true);
      }
      return;
    }
    if (this.incidents.get(key) && failRatio <= INCIDENT_CLEAR_RATIO) {
      const outcome = await notificationService.sendIncidentNotification({ failing, total: totalNodes }, true, probeName);
      if (delivered(outcome)) this.incidents.set(key, false);
    }
    for (const kind of ['offline', 'recovered']) {
      const entries = results.filter(item => item.alertEvent === kind).map(status => ({ node: status.node, status }));
      if (entries.length === 0) continue;
      if (entries.length > MAX_INDIVIDUAL_ALERTS) {
        const outcome = await notificationService.sendBatchNotification(kind, entries, probeName);
        if (delivered(outcome)) for (const { node } of entries) monitor.markAlertSent(node.id, kind);
      } else {
        await Promise.all(entries.map(async ({ node, status }) => {
          const outcome = await notificationService.sendNotification(node, { ...status, statusChanged: true, probeName });
          if (delivered(outcome)) monitor.markAlertSent(node.id, kind);
        }));
      }
    }
  }

  // --- unlock checks (miaospeed-scripts) -----------------------------------------------------

  unlockSettings() {
    const unlock = config.getConfig().unlock || {};
    const chosen = Array.isArray(unlock.scripts) && unlock.scripts.length ? unlock.scripts : scripts.DEFAULT_SCRIPTS;
    return { scripts: chosen.filter(id => scripts.meta(id)), regional: unlock.regional !== false };
  }

  // Groups nodes so that each miaospeed request carries the base scripts plus the region-specific
  // ones for that group's region.
  unlockGroups(nodes, settings) {
    const groups = new Map();
    for (const node of nodes) {
      const extra = settings.regional ? scripts.regional(node.region, settings.scripts) : [];
      const key = extra.join(',');
      if (!groups.has(key)) groups.set(key, { ids: [...settings.scripts, ...extra], regional: extra, nodes: [] });
      groups.get(key).nodes.push(node);
    }
    return [...groups.values()];
  }

  startMediaCheck(nodeIds = [], probeId = null) {
    if (this.mediaJob?.status === 'running') return this.mediaJob;
    const target = probeId || this.registry.defaultProbeId();
    const probe = this.registry.find(target);
    const selected = nodeIds.length > 0 ? this.nodes.filter(node => nodeIds.includes(node.id)) : this.nodes;
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
    if (!probe) return fail('Unknown probe');
    if (!probe.enabled || !probe.online) return fail(`后端 ${probe.name} 不在线`);
    this.executeMediaJob(job, target, selected).catch(error => logger.error(`Media check crashed: ${error.message}`));
    return job;
  }

  async executeMediaJob(job, probeId, nodes) {
    const monitor = this.registry.monitorFor(probeId);
    // Offline nodes cannot produce meaningful results; keep whatever we had before.
    const runnable = nodes.filter(node => monitor.getNodeStatus(node)?.online !== false);
    job.skipped = nodes.length - runnable.length;
    job.completed = job.skipped;
    const names = new Map(runnable.map(node => [node.id, node.name]));
    const settings = this.unlockSettings();
    try {
      for (const group of this.unlockGroups(runnable, settings)) {
        await this.run(probeId, group.nodes, {
          matrices: [...group.ids.map(id => ({ type: MATRIX.SCRIPT, params: id })), MATRIX.GEO_OUT],
          scripts: scripts.forRequest(group.ids), configs: { taskTimeout: MAX_TASK_TIMEOUT_MS, taskRetry: 2 },
          manager: this.backends, timeoutMs: Math.max(180000, group.nodes.length * 30000),
          onResult: (nodeId, result) => {
            monitor.setMediaResult(nodeId, this.toMedia(result, group.regional));
            job.currentNode = names.get(nodeId) || null;
            job.completed += 1;
          }
        });
      }
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.errors += 1;
      logger.error(`Media check on ${probeId} failed: ${error.message}`);
    } finally {
      job.currentNode = null;
      job.finishedAt = new Date().toISOString();
    }
  }

  toMedia(result, regional = []) {
    const services = {};
    for (const [id, value] of Object.entries(result.scripts || {})) {
      const meta = scripts.meta(id);
      services[id] = { ...scripts.classify(value), background: value.background || '', label: meta?.name || id, elapsedMs: value.elapsedMs ?? null, regional: regional.includes(id) };
    }
    const exit = result.outbound?.main;
    return {
      checkedAt: new Date().toISOString(),
      exit: exit ? { ip: exit.ip, region: exit.countryCode || null, asn: exit.asn || null, org: exit.org || '' } : { ip: null, region: null },
      services
    };
  }

  stopMonitoring() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.timer = null;
    this.refreshTimer = null;
  }

  async reloadSubscriptions() { return this.loadNodes(); }

  getStatus() {
    const probes = this.registry.describe();
    return {
      isRunning: Boolean(this.timer), totalNodes: this.nodes.length,
      onlineNodes: monitorService.getOnlineNodes().length,
      offlineNodes: monitorService.getOfflineNodes().length,
      pendingNodes: monitorService.getPendingNodes().length,
      sourceStatus: this.sourceStatus,
      jobs: { health: this.healthJob, media: this.mediaJob },
      engineReady: probes.some(probe => probe.enabled && probe.online),
      unlock: { ...this.unlockSettings(), columns: this.unlockSettings().scripts.map(id => ({ id, label: scripts.meta(id)?.name || id })) },
      probes
    };
  }
}

module.exports = new SchedulerService();
module.exports.SchedulerService = SchedulerService;
