const crypto = require('crypto');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const eventLog = require('./eventLog');
const { diffUnlock } = require('./eventLog');
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
// How often the scheduler looks for subscriptions whose refresh interval has elapsed.
const REFRESH_TICK_MS = 60000;
// A scheduled unlock check that could not start (backend offline) is retried after this long.
const UNLOCK_RETRY_MS = 60 * 60000;

// True when at least one notification channel reported a successful delivery.
const delivered = outcome => Array.isArray(outcome) && outcome.some(item => item && item.success === true);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

class SchedulerService {
  constructor({ probes = registry, manager = backends, run = runForNodes, events = eventLog } = {}) {
    this.events = events;
    this.registry = probes;
    this.backends = manager;
    this.run = run;
    this.timer = null;
    this.refreshTimer = null;
    this.nodes = [];
    // Nodes that left their subscription, shown but not checked (see retiredAfterFetch).
    this.retiredNodes = [];
    this.sourceStatus = [];
    this.healthJob = null;
    this.mediaJob = null;
    this.lastGood = new Map();
    // Latest fetch result per subscription id: { url, fetchedAt, nodes, status }. Lets one subscription
    // be refreshed (or a source added/removed) without downloading every other subscription again.
    this.subscriptionResults = new Map();
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
      const fetchedAt = new Date().toISOString();
      this.lastGood.set(subscription.id, { nodes, at: fetchedAt });
      return {
        nodes,
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: true,
          nodeCount: nodes.length, durationMs: Date.now() - startedAt, errors: parsed.errors.length,
          fetchedAt, lastSuccessAt: fetchedAt }
      };
    } catch (error) {
      // A subscription server hiccup must not make the subscription's nodes vanish from monitoring
      // (which would also throw away their alert state): keep serving the last good list.
      const good = this.lastGood.get(subscription.id);
      const stale = good?.nodes || [];
      logger.warn(`Subscription "${subscription.name}" refresh failed: ${error.message}; `
        + (stale.length ? `keeping ${stale.length} nodes from the last successful fetch` : 'no previous nodes to keep'));
      return {
        nodes: stale,
        status: { id: subscription.id, name: subscription.name, type: 'subscription', ok: false,
          stale: stale.length > 0, nodeCount: stale.length, durationMs: Date.now() - startedAt, error: error.message,
          fetchedAt: new Date().toISOString(), lastSuccessAt: good?.at || null }
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

  // Auto-refresh interval of one subscription in ms: its own `refreshMinutes` when set (0 = manual
  // only), otherwise the global subscription refresh interval.
  refreshIntervalMs(subscription) {
    const own = subscription.refreshMinutes;
    if (own !== undefined && own !== null && Number.isFinite(Number(own))) return Math.max(0, Number(own)) * 60000;
    return Math.max(1, Number(config.getConfig().monitoring?.subscriptionRefreshMinutes || 30)) * 60000;
  }

  // Which subscriptions a load downloads again; the rest reuse their last result.
  //   'all'    every subscription (startup, "reload all")
  //   'due'    those whose refresh interval has elapsed (the auto-refresh timer)
  //   'cached' none, only rebuild the node list (a source was added, edited or removed)
  //   [ids]    the given subscriptions (manual refresh of one subscription)
  // A subscription that was never fetched, or whose URL changed, is always downloaded.
  shouldFetch(subscription, refresh, now) {
    const cached = this.subscriptionResults.get(subscription.id);
    if (!cached || cached.url !== subscription.url) return true;
    if (refresh === 'all') return true;
    if (refresh === 'due') {
      const interval = this.refreshIntervalMs(subscription);
      return interval > 0 && now >= cached.fetchedAt + interval;
    }
    return Array.isArray(refresh) && refresh.includes(subscription.id);
  }

  // Loads are serialised so a scheduled refresh and a user-triggered reload never run concurrently.
  loadNodes({ refresh = 'all' } = {}) {
    const run = this.loadChain.then(() => this.performLoad({ refresh }));
    this.loadChain = run.catch(() => {});
    return run;
  }

  async performLoad({ refresh = 'all' } = {}) {
    const cfg = config.getConfig();
    const subscriptions = (cfg.subscriptions || []).filter(item => item.enabled !== false);
    const activeIds = new Set(subscriptions.map(item => item.id));
    for (const id of this.lastGood.keys()) if (!activeIds.has(id)) this.lastGood.delete(id);
    for (const id of this.subscriptionResults.keys()) if (!activeIds.has(id)) this.subscriptionResults.delete(id);
    const now = Date.now();
    const fetchIds = new Set(subscriptions.filter(item => this.shouldFetch(item, refresh, now)).map(item => item.id));
    if (refresh === 'due' && fetchIds.size === 0) return this.nodes;
    const prune = cfg.monitoring?.pruneRemovedNodes === true;
    const subscriptionResults = await Promise.all(subscriptions.map(async item => {
      const previous = this.subscriptionResults.get(item.id);
      if (!fetchIds.has(item.id)) return prune ? { ...previous, retired: [] } : previous;
      const result = await this.loadSubscription(item);
      const entry = { ...result, retired: prune ? [] : this.retiredAfterFetch(previous, result, item), url: item.url, fetchedAt: Date.now() };
      this.subscriptionResults.set(item.id, entry);
      this.logSubscriptionChange(item, previous, entry);
      return entry;
    }));
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
    const retired = new Map();
    for (const node of subscriptionResults.flatMap(item => item.retired || [])) {
      if (!unique.has(node.id) && !excluded.has(node.id) && !excluded.has(node.name)) retired.set(node.id, node);
    }
    this.nodes = Array.from(unique.values());
    this.retiredNodes = Array.from(retired.values());
    this.sourceStatus = allResults.map(item => (item.retired?.length ? { ...item.status, retiredCount: item.retired.length } : item.status));
    // Retired nodes stay visible with their last status but are no longer checked.
    this.registry.syncNodes([...this.nodes, ...this.retiredNodes]);
    logger.info(`Loaded ${this.nodes.length} nodes from ${allResults.length} sources`
      + (this.retiredNodes.length ? `, keeping ${this.retiredNodes.length} that left their subscription` : '')
      + (fetchIds.size < subscriptions.length ? ` (${fetchIds.size} subscription(s) downloaded)` : ''));
    return this.nodes;
  }

  // Log failures / recoveries (transitions only, not every failed retry) and nodes added or removed.
  logSubscriptionChange(subscription, previous, entry) {
    const base = { category: 'subscription', sourceId: subscription.id, sourceName: subscription.name };
    if (!entry.status.ok) {
      if (!previous || previous.status?.ok) {
        this.events.add({ ...base, level: 'warning', title: `订阅「${subscription.name}」拉取失败`,
          detail: `${entry.status.error}${entry.status.stale ? '；沿用上次成功拉取的节点' : ''}` });
      }
      return;
    }
    if (previous && !previous.status?.ok) this.events.add({ ...base, title: `订阅「${subscription.name}」拉取恢复正常`, detail: `${entry.nodes.length} 个节点` });
    if (!previous || previous.url !== subscription.url) return;
    const before = new Set((previous.nodes || []).map(node => node.id));
    const after = new Set(entry.nodes.map(node => node.id));
    const added = entry.nodes.filter(node => !before.has(node.id));
    const removed = (previous.nodes || []).filter(node => !after.has(node.id));
    if (!added.length && !removed.length) return;
    const names = list => list.slice(0, 8).map(node => node.name).join('、') + (list.length > 8 ? ` 等 ${list.length} 个` : '');
    this.events.add({ ...base, title: `订阅「${subscription.name}」节点变化：新增 ${added.length}，移除 ${removed.length}`,
      detail: [added.length && `新增：${names(added)}`, removed.length && `移除：${names(removed)}`].filter(Boolean).join('\n') });
  }

  // Nodes a fresh fetch no longer lists, kept (marked retired) unless pruneRemovedNodes is on. Only a
  // successful fetch of the same URL retires nodes; a failed fetch keeps the last good list as it was.
  retiredAfterFetch(previous, result, subscription) {
    if (!previous || previous.url !== subscription.url) return [];
    const current = new Set(result.nodes.map(node => node.id));
    const candidates = result.status.ok ? [...(previous.nodes || []), ...(previous.retired || [])] : previous.retired || [];
    const retired = new Map();
    for (const node of candidates) if (!current.has(node.id)) retired.set(node.id, { ...node, retired: true });
    return Array.from(retired.values());
  }

  startMonitoring() {
    this.stopMonitoring();
    const monitoring = config.getConfig().monitoring || {};
    const minutes = Math.max(1, Number(monitoring.checkIntervalMinutes || 5));
    const refreshMinutes = Math.max(1, Number(monitoring.subscriptionRefreshMinutes || 30));
    this.timer = setInterval(() => {
      this.runHealthCheck().catch(error => logger.error(`Scheduled health check failed: ${error.message}`));
    }, minutes * 60000);
    // Each subscription has its own interval, so poll for due ones instead of reloading everything.
    // The same tick starts the scheduled unlock check.
    this.refreshTimer = setInterval(() => { this.refreshDue(); this.unlockDue(); }, REFRESH_TICK_MS);
    this.timer.unref?.();
    this.refreshTimer.unref?.();
    logger.info(`Health checks every ${minutes} minute(s); subscriptions refreshed every ${refreshMinutes} minute(s)`);
  }

  refreshDue() {
    if (this.refreshingDue) return;
    this.refreshingDue = true;
    this.loadNodes({ refresh: 'due' })
      .catch(error => logger.error(`Scheduled subscription refresh failed: ${error.message}`))
      .finally(() => { this.refreshingDue = false; });
  }

  // Starts the scheduled unlock check (all nodes, default backend) once `unlock.scheduleHours` passed.
  unlockDue(now = Date.now()) {
    const hours = this.unlockSettings().scheduleHours;
    if (!hours || this.mediaJob?.status === 'running' || now < (this.unlockRetryAt || 0)) return null;
    const last = Date.parse(this.events.lastScheduledUnlockAt || '') || 0;
    if (now - last < hours * 3600000) return null;
    const job = this.startMediaCheck([], null, { trigger: 'schedule' });
    if (job.status === 'failed') {
      this.unlockRetryAt = now + UNLOCK_RETRY_MS;
      this.events.add({ category: 'unlock', level: 'warning', title: '定时解锁检测未能开始', detail: `${job.error}；1 小时后重试` });
    } else {
      this.unlockRetryAt = 0;
      this.events.markScheduledUnlock(new Date(now).toISOString());
    }
    return job;
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

  // One round on every enabled probe (miaospeed backend) whose health-check switch is on, in parallel.
  // `only` limits the round to the given probe ids. Offline probes are skipped, never recorded as node failures.
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
      const probes = this.registry.list().filter(probe => probe.enabled && probe.monitor !== false && (!only || only.includes(probe.id)));
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
          const before = monitor.getNodeStatus(node);
          const status = monitor.applyProbeResult(node, {
            online, latency: online ? result.http : null, rtt: result.rtt > 0 ? result.rtt : null,
            error: online ? null : '连接超时或失败'
          }, { ...options, checkMethod: 'miaospeed' });
          if (status) {
            applied.push(status);
            this.logNodeTransition(node, before, status, probe);
          }
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

  // Confirmed outages and recoveries (same threshold as alerts, independent of notification delivery).
  logNodeTransition(node, before, status, probe) {
    const base = { category: 'node', nodeId: node.id, nodeName: node.name, probeId: probe.id, probeName: probe.name };
    const where = this.probeLabel(probe.id) ? `（${probe.name}）` : '';
    if (status.confirmedDown && !before?.confirmedDown && status.seenOnline) {
      this.events.add({ ...base, level: 'error', title: `${node.name} 离线${where}`, detail: `连续 ${status.consecutiveFailures} 次检测失败：${status.error || '连接失败'}` });
    } else if (status.online && before?.confirmedDown) {
      this.events.add({ ...base, title: `${node.name} 恢复在线${where}`, detail: status.responseTime ? `HTTP 延迟 ${status.responseTime} ms` : '' });
    }
  }

  // Probe connectivity alerts: a backend that stays unreachable for a while is reported once, and
  // its return is reported if (and only if) the outage was.
  watchProbes(emitter) {
    if (this.watching === emitter) return;
    this.watching = emitter;
    emitter.on('connect', probe => {
      this.events.add({ category: 'probe', probeId: probe.id, probeName: probe.name, title: `后端 ${probe.name} 已连接` });
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
      this.events.add({ category: 'probe', level: 'warning', probeId: probe.id, probeName: probe.name, title: `后端 ${probe.name} 断开连接` });
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
    const scheduleHours = Math.max(0, Math.min(720, Number(unlock.scheduleHours) || 0));
    return { scripts: chosen.filter(id => scripts.meta(id)), regional: unlock.regional !== false, scheduleHours,
      lastScheduledAt: this.events.lastScheduledUnlockAt || null };
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

  startMediaCheck(nodeIds = [], probeId = null, { trigger = 'manual' } = {}) {
    if (this.mediaJob?.status === 'running') return this.mediaJob;
    const target = probeId || this.registry.defaultProbeId();
    const probe = this.registry.find(target);
    const selected = nodeIds.length > 0 ? this.nodes.filter(node => nodeIds.includes(node.id)) : this.nodes;
    const job = {
      id: crypto.randomUUID(), type: 'media', status: 'running', total: selected.length,
      completed: 0, errors: 0, skipped: 0, currentNode: null, probeId: target, trigger, changes: 0,
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
    this.executeMediaJob(job, target, selected, probe).catch(error => logger.error(`Media check crashed: ${error.message}`));
    return job;
  }

  async executeMediaJob(job, probeId, nodes, probe = this.registry.find(probeId)) {
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
            const media = this.toMedia(result, group.regional);
            job.changes = (job.changes || 0) + this.trackUnlockChanges(probeId, probe?.name || probeId, { id: nodeId, name: names.get(nodeId) }, media);
            monitor.setMediaResult(nodeId, media);
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
      if (nodes.length === this.nodes.length) this.events.pruneBaselines(probeId, new Set(this.nodes.map(node => node.id)));
      this.events.add({
        category: 'unlock', level: job.status === 'failed' ? 'error' : 'info', probeId, probeName: probe?.name || probeId,
        title: `${job.trigger === 'schedule' ? '定时' : '手动'}解锁检测${job.status === 'failed' ? '失败' : '完成'}：${job.completed - job.skipped}/${job.total} 个节点`,
        detail: [job.skipped && `${job.skipped} 个离线节点跳过`, `${job.changes || 0} 项解锁状态变化`, job.error].filter(Boolean).join('；')
      });
    }
  }

  // Compares a node's fresh unlock result with the stored baseline, logs what changed and marks lost
  // services (lostSince) on the result. Returns the number of logged changes.
  trackUnlockChanges(probeId, probeName, node, media) {
    const { next, changes } = diffUnlock(this.events.baseline(probeId, node.id), media.services);
    this.events.setBaseline(probeId, node.id, next);
    for (const [id, value] of Object.entries(media.services)) {
      if (next[id]?.lostSince && value.status !== 'unlocked') Object.assign(value, { lostSince: next[id].lostSince, lostRegion: next[id].lostRegion || null });
    }
    const where = this.probeLabel(probeId) ? `（${probeName}）` : '';
    for (const change of changes) {
      const label = media.services[change.id]?.label || change.id;
      const text = item => `${item.status === 'unlocked' ? '解锁' : { blocked: '失败', limited: '受限', na: 'N/A' }[item.status] || item.status}${item.region ? ` ${item.region}` : ''}`;
      const title = { lost: `${node.name}：${label} 解锁失效`, restored: `${node.name}：${label} 恢复解锁`, region: `${node.name}：${label} 解锁地区变化` }[change.kind];
      this.events.add({
        category: 'unlock', level: change.kind === 'lost' ? 'warning' : 'info', nodeId: node.id, nodeName: node.name, probeId, probeName,
        service: change.id, title: title + where, detail: `${text(change.before)} → ${text(change.after)}`
      });
    }
    return changes.length;
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

  // Rebuilds the node list after a source was added, edited or removed, downloading only what is new.
  async rebuildNodes() { return this.loadNodes({ refresh: 'cached' }); }

  // Downloads one subscription now; resolves with its fresh status.
  async refreshSubscription(id) {
    await this.loadNodes({ refresh: [id] });
    return this.sourceStatusFor(id);
  }

  // Source status plus when each subscription is next refreshed automatically.
  sourceStatusFor(id) {
    const status = this.sourceStatus.find(item => item.id === id);
    if (!status || status.type !== 'subscription') return status || null;
    const subscription = (config.getConfig().subscriptions || []).find(item => item.id === id);
    const cached = this.subscriptionResults.get(id);
    const interval = subscription ? this.refreshIntervalMs(subscription) : 0;
    return {
      ...status, refreshMinutes: interval / 60000,
      nextRefreshAt: cached && interval > 0 ? new Date(cached.fetchedAt + interval).toISOString() : null
    };
  }

  getStatus() {
    const probes = this.registry.describe();
    return {
      isRunning: Boolean(this.timer), totalNodes: this.nodes.length,
      onlineNodes: monitorService.getOnlineNodes().length,
      offlineNodes: monitorService.getOfflineNodes().length,
      pendingNodes: monitorService.getPendingNodes().length,
      sourceStatus: this.sourceStatus.map(item => this.sourceStatusFor(item.id)),
      jobs: { health: this.healthJob, media: this.mediaJob },
      engineReady: probes.some(probe => probe.enabled && probe.online),
      unlock: { ...this.unlockSettings(), columns: this.unlockSettings().scripts.map(id => ({ id, label: scripts.meta(id)?.name || id })) },
      probes
    };
  }
}

module.exports = new SchedulerService();
module.exports.SchedulerService = SchedulerService;
