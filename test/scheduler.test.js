require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const { SchedulerService } = require('../src/services/scheduler');
const subscriptionService = require('../src/services/subscription');
const notificationService = require('../src/services/notification');
const monitorService = require('../src/services/monitor');
const { MonitorService } = require('../src/services/monitor');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const proxy = { name: 'Tokyo', type: 'vless', server: 'a.example.com', port: 443, uuid: '12345678-1234-1234-9234-123456789012' };
const sample = id => ({ id, name: `Node ${id}`, protocol: 'vless', server: `${id}.example.com`, port: 443 });

// Temporarily replace methods on shared singletons and always restore them.
function stub(target, replacements) {
  const originals = {};
  for (const key of Object.keys(replacements)) {
    originals[key] = target[key];
    target[key] = replacements[key];
  }
  return () => Object.assign(target, originals);
}

test('a failed subscription refresh keeps the last good nodes instead of dropping them', async () => {
  const scheduler = new SchedulerService();
  let calls = 0;
  const restore = stub(subscriptionService, {
    getNodes: async () => {
      calls += 1;
      if (calls === 1) return { proxies: [proxy], errors: [] };
      throw new Error('ETIMEDOUT');
    }
  });
  try {
    const subscription = { id: 's1', name: 'Airport', url: 'https://example.com/sub' };
    const first = await scheduler.loadSubscription(subscription);
    assert.equal(first.status.ok, true);
    assert.equal(first.nodes.length, 1);
    const second = await scheduler.loadSubscription(subscription);
    assert.equal(second.status.ok, false);
    assert.equal(second.status.stale, true);
    assert.deepEqual(second.nodes.map(node => node.id), first.nodes.map(node => node.id));
  } finally {
    restore();
  }
});

test('node loads run one at a time and a failed load does not break later ones', async () => {
  const scheduler = new SchedulerService();
  const order = [];
  let running = 0;
  let maxRunning = 0;
  let call = 0;
  scheduler.performLoad = async () => {
    const id = ++call;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    order.push(`start-${id}`);
    await new Promise(resolve => setTimeout(resolve, 10));
    running -= 1;
    order.push(`end-${id}`);
    if (id === 1) throw new Error('reload failed');
    return [];
  };
  const results = await Promise.allSettled([scheduler.loadNodes(), scheduler.loadNodes(), scheduler.loadNodes()]);
  assert.equal(maxRunning, 1);
  assert.deepEqual(results.map(item => item.status), ['rejected', 'fulfilled', 'fulfilled']);
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
});

// A scheduler over a fixed configuration whose subscriptions serve `served[url]` (proxy lists).
function refreshHarness(monitoring = {}) {
  const config = require('../src/utils/config');
  const cfg = {
    monitoring: { subscriptionRefreshMinutes: 30, ...monitoring },
    subscriptions: [
      { id: 'a', name: 'A', url: 'https://a.example.com/sub' },
      { id: 'b', name: 'B', url: 'https://b.example.com/sub', refreshMinutes: 0 }
    ],
    imports: [], manualNodes: [], excludeNodes: []
  };
  const served = {
    'https://a.example.com/sub': [proxy, { ...proxy, name: 'Osaka', server: 'b.example.com' }],
    'https://b.example.com/sub': [{ ...proxy, name: 'HK', server: 'hk.example.com' }]
  };
  const fetched = [];
  const synced = [];
  const restoreConfig = stub(config, { getConfig: () => cfg });
  const restoreSubscription = stub(subscriptionService, {
    getNodes: async url => { fetched.push(url); return { proxies: served[url], errors: [] }; }
  });
  const scheduler = new SchedulerService({ probes: { syncNodes: nodes => synced.push(nodes) } });
  return { scheduler, cfg, served, fetched, synced, restore: () => { restoreConfig(); restoreSubscription(); } };
}

test('refreshing one subscription downloads only that one and keeps the others', async () => {
  const { scheduler, fetched, restore } = refreshHarness();
  try {
    await scheduler.loadNodes();
    assert.equal(fetched.length, 2);
    assert.equal(scheduler.nodes.length, 3);
    fetched.length = 0;
    const status = await scheduler.refreshSubscription('a');
    assert.deepEqual(fetched, ['https://a.example.com/sub']);
    assert.equal(status.ok, true);
    assert.equal(status.refreshMinutes, 30);
    assert.ok(status.nextRefreshAt);
    assert.equal(scheduler.nodes.length, 3);
    fetched.length = 0;
    await scheduler.loadNodes({ refresh: 'cached' });
    assert.deepEqual(fetched, []);
  } finally {
    restore();
  }
});

test('the auto-refresh only downloads subscriptions whose own interval has elapsed', async () => {
  const { scheduler, fetched, restore } = refreshHarness();
  try {
    await scheduler.loadNodes();
    fetched.length = 0;
    await scheduler.loadNodes({ refresh: 'due' });
    assert.deepEqual(fetched, []);
    // 31 minutes later: A (global 30 min) is due, B (manual only) never is.
    for (const entry of scheduler.subscriptionResults.values()) entry.fetchedAt -= 31 * 60000;
    await scheduler.loadNodes({ refresh: 'due' });
    assert.deepEqual(fetched, ['https://a.example.com/sub']);
    assert.equal(scheduler.sourceStatusFor('b').nextRefreshAt, null);
  } finally {
    restore();
  }
});

test('nodes that leave a subscription are kept as retired unless pruning is on', async () => {
  const { scheduler, cfg, served, synced, restore } = refreshHarness();
  try {
    await scheduler.loadNodes();
    served['https://a.example.com/sub'] = [proxy];
    await scheduler.refreshSubscription('a');
    assert.equal(scheduler.nodes.length, 2);
    assert.deepEqual(scheduler.retiredNodes.map(node => node.name), ['Osaka']);
    assert.equal(scheduler.retiredNodes[0].retired, true);
    // retired nodes are listed (synced to the monitors) but not part of the checked node list
    assert.equal(synced.at(-1).length, 3);
    assert.equal(scheduler.sourceStatusFor('a').retiredCount, 1);
    // a node that comes back is active again
    served['https://a.example.com/sub'] = [proxy, { ...proxy, name: 'Osaka', server: 'b.example.com' }];
    await scheduler.refreshSubscription('a');
    assert.deepEqual(scheduler.retiredNodes, []);
    assert.equal(scheduler.nodes.length, 3);

    served['https://a.example.com/sub'] = [proxy];
    await scheduler.refreshSubscription('a');
    assert.equal(scheduler.retiredNodes.length, 1);
    cfg.monitoring.pruneRemovedNodes = true;
    await scheduler.rebuildNodes();
    assert.deepEqual(scheduler.retiredNodes, []);
    assert.equal(synced.at(-1).length, 2);
  } finally {
    restore();
  }
});

test('a failed fetch neither retires nor drops nodes', async () => {
  const { scheduler, served, restore } = refreshHarness();
  try {
    await scheduler.loadNodes();
    served['https://a.example.com/sub'] = undefined;
    subscriptionService.getNodes = async () => { throw new Error('ETIMEDOUT'); };
    const status = await scheduler.refreshSubscription('a');
    assert.equal(status.ok, false);
    assert.ok(status.lastSuccessAt);
    assert.equal(scheduler.nodes.length, 3);
    assert.deepEqual(scheduler.retiredNodes, []);
  } finally {
    restore();
  }
});

function alertHarness({ ok = true } = {}) {
  const calls = { single: [], batch: [], incident: [], marked: [] };
  const outcome = () => [{ service: 'telegram', success: ok, ...(ok ? {} : { error: 'channel down' }) }];
  const restoreNotification = stub(notificationService, {
    sendNotification: async (node, status) => { calls.single.push([node.id, status.online, status.statusChanged]); return outcome(); },
    sendBatchNotification: async (kind, entries) => { calls.batch.push([kind, entries.length]); return outcome(); },
    sendIncidentNotification: async (info, resolved) => { calls.incident.push([info.failing, info.total, resolved]); return outcome(); }
  });
  const restoreMonitor = stub(monitorService, {
    markAlertSent: (id, kind) => { calls.marked.push([id, kind]); }
  });
  return { calls, restore: () => { restoreNotification(); restoreMonitor(); } };
}
const result = (id, online, alertEvent = null) => ({ node: sample(id), online, alertEvent, error: online ? null : 'timeout' });

test('a single alert is sent as a normal notification and committed', async () => {
  const scheduler = new SchedulerService();
  const { calls, restore } = alertHarness();
  try {
    const results = [result('a', false, 'offline'), ...['b', 'c', 'd', 'e', 'f', 'g'].map(id => result(id, true))];
    await scheduler.dispatchAlerts(results, results.length);
  } finally {
    restore();
  }
  assert.deepEqual(calls.single, [['a', false, true]]);
  assert.deepEqual(calls.batch, []);
  assert.deepEqual(calls.marked, [['a', 'offline']]);
});

test('several alerts in one cycle are merged into one message', async () => {
  const scheduler = new SchedulerService();
  const { calls, restore } = alertHarness();
  try {
    const failing = ['a', 'b', 'c', 'd', 'e'].map(id => result(id, false, 'offline'));
    const healthy = ['f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'].map(id => result(id, true));
    await scheduler.dispatchAlerts([...failing, ...healthy], failing.length + healthy.length);
  } finally {
    restore();
  }
  assert.deepEqual(calls.batch, [['offline', 5]]);
  assert.deepEqual(calls.single, []);
  assert.equal(calls.marked.length, 5);
});

test('when nearly every node fails at once only one incident message is sent and alerts stay pending', async () => {
  const scheduler = new SchedulerService();
  const { calls, restore } = alertHarness();
  try {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const storm = ids.map((id, index) => result(id, index === 9, index < 9 ? 'offline' : null));
    await scheduler.dispatchAlerts(storm, ids.length);
    await scheduler.dispatchAlerts(storm, ids.length);          // still failing: no second message
    assert.deepEqual(calls.incident, [[9, 10, false]]);
    assert.deepEqual(calls.single, []);
    assert.deepEqual(calls.marked, []);                         // nothing committed, so nothing is lost

    const recovered = ids.map((id, index) => result(id, index !== 0, index === 0 ? 'offline' : null));
    await scheduler.dispatchAlerts(recovered, ids.length);
    assert.deepEqual(calls.incident, [[9, 10, false], [1, 10, true]]);
    assert.deepEqual(calls.single, [['a', false, true]]);       // the one node that really is down still alerts
  } finally {
    restore();
  }
});

function fakeProbes(probes) {
  const monitors = new Map(probes.map(probe => [probe.id, new MonitorService({
    historyPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nw-sched-')), 'history.json')
  })]));
  return {
    monitors,
    list: () => probes,
    find: id => probes.find(probe => probe.id === id) || null,
    monitorFor: id => monitors.get(id) || null,
    defaultProbeId: () => probes[0].id,
    syncNodes: nodes => monitors.forEach(monitor => monitor.syncNodes(nodes)),
    describe: () => probes
  };
}

test('health checks skip offline backends instead of recording failures', async () => {
  const probes = fakeProbes([{ id: 'local', name: '本机', type: 'local', enabled: true, online: false }]);
  const scheduler = new SchedulerService({ probes, run: async () => { throw new Error('must not run'); } });
  scheduler.nodes = [{ ...sample('a'), proxy }];
  probes.syncNodes(scheduler.nodes);
  const job = await scheduler.runHealthCheck();
  assert.equal(job.status, 'skipped');
  assert.match(job.error, /不在线/);
  assert.equal(probes.monitorFor('local').getNodeStatus('a').online, null);
});

test('health checks record miaospeed HTTP latency per backend and treat 0 ms as offline', async () => {
  const probes = fakeProbes([
    { id: 'local', name: '本机', type: 'local', enabled: true, online: true },
    { id: 'm-1', name: '家里', type: 'reverse', enabled: true, online: true },
    { id: 'm-2', name: '停用', type: 'forward', enabled: false, online: true }
  ]);
  const calls = [];
  const run = async (backendId, nodes, { matrices, configs, onResult }) => {
    calls.push([backendId, matrices, configs.taskTimeout]);
    nodes.forEach(node => onResult(node.id, { http: node.id === 'b' ? 0 : 150, rtt: node.id === 'b' ? 0 : 40 }));
    return { version: 'x', results: new Map() };
  };
  const scheduler = new SchedulerService({ probes, run });
  scheduler.dispatchAlerts = async () => {};
  scheduler.nodes = ['a', 'b'].map(id => ({ ...sample(id), proxy }));
  probes.syncNodes(scheduler.nodes);
  const job = await scheduler.runHealthCheck();
  assert.equal(job.status, 'completed');
  assert.deepEqual(calls.map(call => call[0]).sort(), ['local', 'm-1']);
  assert.deepEqual(calls[0][1], ['TEST_PING_CONN', 'TEST_PING_RTT']);
  assert.ok(calls[0][2] <= 10000);
  const home = probes.monitorFor('m-1');
  assert.equal(home.getNodeStatus('a').online, true);
  assert.equal(home.getNodeStatus('a').responseTime, 150);
  assert.equal(home.getNodeStatus('a').rtt, 40);
  assert.equal(home.getNodeStatus('b').online, false);
  assert.equal(job.completed, 4);
});

test('unlock checks skip offline nodes, add regional scripts per region and classify results', async () => {
  const probes = fakeProbes([{ id: 'local', name: '本机', type: 'local', enabled: true, online: true }]);
  const requests = [];
  const run = async (backendId, nodes, { matrices, scripts: sent, onResult }) => {
    requests.push({ nodes: nodes.map(node => node.id), scripts: sent.map(item => item.id), matrices });
    nodes.forEach(node => onResult(node.id, {
      scripts: { netflix: { text: '解锁(hk)', background: '186,230,126' } },
      outbound: { main: { ip: '9.9.9.9', countryCode: 'HK', asn: 1, org: 'Org' } }
    }));
    return { version: 'x', results: new Map() };
  };
  const scheduler = new SchedulerService({ probes, run });
  const nodes = [{ ...sample('hk'), region: 'HK', proxy }, { ...sample('us'), region: 'US', proxy }, { ...sample('down'), region: 'HK', proxy }];
  scheduler.nodes = nodes;
  probes.syncNodes(nodes);
  const monitor = probes.monitorFor('local');
  monitor.updateNodeStatus(nodes[0], { online: true });
  monitor.updateNodeStatus(nodes[1], { online: true });
  monitor.updateNodeStatus(nodes[2], { online: false });
  const job = { status: 'running', total: 3, completed: 0, errors: 0, skipped: 0 };
  await scheduler.executeMediaJob(job, 'local', nodes);
  assert.equal(job.status, 'completed');
  assert.equal(job.skipped, 1);
  assert.equal(job.completed, 3);
  assert.equal(requests.length, 2, 'one request per region group');
  assert.ok(requests.every(request => request.scripts.includes('netflix')));
  const hkScripts = requests.find(request => request.nodes.includes('hk')).scripts;
  const expected = require('../src/miaospeed/scripts').regional('HK', scheduler.unlockSettings().scripts);
  assert.ok(expected.length > 0 && expected.every(id => hkScripts.includes(id)), 'HK nodes get the HK regional scripts');
  assert.ok(requests.flatMap(request => request.nodes).every(id => id !== 'down'));
  assert.ok(requests[0].matrices.some(matrix => matrix === 'GEOIP_OUTBOUND'));
  const media = monitor.getNodeStatus('hk').media;
  assert.deepEqual([media.services.netflix.status, media.services.netflix.region, media.exit.region], ['unlocked', 'HK', 'HK']);
});

test('alerts that no channel delivered stay pending and are retried', async () => {
  const scheduler = new SchedulerService();
  const failing = alertHarness({ ok: false });
  try {
    const results = [result('a', false, 'offline'), ...['b', 'c', 'd', 'e', 'f'].map(id => result(id, true))];
    await scheduler.dispatchAlerts(results, results.length);
    assert.deepEqual(failing.calls.single, [['a', false, true]]);
    assert.deepEqual(failing.calls.marked, [], 'not committed when every channel failed');
  } finally {
    failing.restore();
  }
  const working = alertHarness({ ok: true });
  try {
    const results = [result('a', false, 'offline'), ...['b', 'c', 'd', 'e', 'f'].map(id => result(id, true))];
    await scheduler.dispatchAlerts(results, results.length);
    assert.deepEqual(working.calls.marked, [['a', 'offline']]);
  } finally {
    working.restore();
  }
});

test('an undelivered incident notice is retried and does not leave alerts suppressed for good', async () => {
  const scheduler = new SchedulerService();
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const storm = ids.map(id => result(id, false, 'offline'));
  const failing = alertHarness({ ok: false });
  try {
    await scheduler.dispatchAlerts(storm, ids.length);
    await scheduler.dispatchAlerts(storm, ids.length);
    assert.equal(failing.calls.incident.length, 2, 'retried on the next cycle');
  } finally {
    failing.restore();
  }
  const working = alertHarness({ ok: true });
  try {
    await scheduler.dispatchAlerts(storm, ids.length);
    await scheduler.dispatchAlerts(storm, ids.length);
    assert.equal(working.calls.incident.length, 1, 'sent once after it got through');
    const calm = ids.map(id => result(id, true));
    await scheduler.dispatchAlerts(calm, ids.length);
    assert.deepEqual(working.calls.incident.at(-1), [0, 10, true]);
  } finally {
    working.restore();
  }
});

test('skipped probes do not inflate the failure ratio into an incident', async () => {
  const scheduler = new SchedulerService();
  const { calls, restore } = alertHarness();
  try {
    // 10 nodes, but only 1 result came back (the rest were skipped) and it is a failure.
    await scheduler.dispatchAlerts([result('a', false, 'offline')], 10);
  } finally {
    restore();
  }
  assert.deepEqual(calls.incident, []);
  assert.deepEqual(calls.single, [['a', false, true]]);
});

// --- unlock change tracking, scheduled unlock checks, event log ---------------------------------

const { EventLog, diffUnlock } = require('../src/services/eventLog');
const tmpEvents = () => new EventLog({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nw-events-')), 'events.json') });

test('unlock diffs report lost, restored and region changes and ignore error results', () => {
  const unlockedJP = { status: 'unlocked', region: 'JP' };
  const first = diffUnlock({}, { netflix: unlockedJP, youtube: { status: 'error' } }, 't0');
  assert.deepEqual(first.changes, []);
  assert.deepEqual(Object.keys(first.next), ['netflix']);

  const lost = diffUnlock(first.next, { netflix: { status: 'blocked', region: null } }, 't1');
  assert.deepEqual(lost.changes.map(item => item.kind), ['lost']);
  assert.deepEqual([lost.next.netflix.lostSince, lost.next.netflix.lostRegion], ['t1', 'JP']);

  const stillLost = diffUnlock(lost.next, { netflix: { status: 'na' } }, 't2');
  assert.deepEqual(stillLost.changes, []);
  assert.equal(stillLost.next.netflix.lostSince, 't1');
  assert.equal(diffUnlock(stillLost.next, { netflix: { status: 'error' } }, 't3').next.netflix.lostSince, 't1');

  const restored = diffUnlock(stillLost.next, { netflix: unlockedJP }, 't4');
  assert.deepEqual(restored.changes.map(item => item.kind), ['restored']);
  assert.equal(restored.next.netflix.lostSince, undefined);

  assert.deepEqual(diffUnlock(restored.next, { netflix: { status: 'unlocked', region: 'US' } }).changes.map(item => item.kind), ['region']);
});

test('an unlock that disappears between checks is logged and marked until it comes back', async () => {
  const probes = fakeProbes([{ id: 'local', name: '本机', type: 'local', enabled: true, online: true }]);
  let answer = { text: '解锁(jp)', background: '186,230,126' };
  const run = async (backendId, nodes, { onResult }) => {
    nodes.forEach(node => onResult(node.id, { scripts: { netflix: answer }, outbound: { main: { ip: '1.1.1.1', countryCode: 'JP' } } }));
    return { results: new Map() };
  };
  const events = tmpEvents();
  const scheduler = new SchedulerService({ probes, run, events });
  const node = { ...sample('jp'), region: 'JP', proxy };
  scheduler.nodes = [node];
  probes.syncNodes([node]);
  const monitor = probes.monitorFor('local');
  monitor.updateNodeStatus(node, { online: true });
  const check = () => scheduler.executeMediaJob({ status: 'running', total: 1, completed: 0, errors: 0, skipped: 0, trigger: 'manual', changes: 0 }, 'local', [node]);

  await check();
  assert.equal(events.list({ category: 'unlock' }).filter(item => item.service).length, 0, 'the first result is only a baseline');
  answer = { text: '失败', background: '239,107,115' };
  await check();
  const lost = events.list({ category: 'unlock' }).find(item => item.service === 'netflix');
  assert.equal(lost.level, 'warning');
  assert.match(lost.title, /Netflix 解锁失效/);
  assert.equal(lost.detail, '解锁 JP → 失败');
  const marked = monitor.getNodeStatus('jp').media.services.netflix;
  assert.ok(marked.lostSince);
  assert.equal(marked.lostRegion, 'JP');

  answer = { text: '解锁(jp)', background: '186,230,126' };
  await check();
  assert.match(events.list({ category: 'unlock' }).find(item => item.service === 'netflix').title, /恢复解锁/);
  assert.equal(monitor.getNodeStatus('jp').media.services.netflix.lostSince, undefined);
  // each run also logs a summary line
  assert.equal(events.list({ category: 'unlock' }).filter(item => !item.service).length, 3);
});

test('the scheduled unlock check runs once per interval and retries later when it cannot start', () => {
  const config = require('../src/utils/config');
  const restoreConfig = stub(config, { getConfig: () => ({ unlock: { scheduleHours: 24 }, monitoring: {} }) });
  const events = tmpEvents();
  const scheduler = new SchedulerService({ probes: fakeProbes([]), events });
  const started = [];
  let fail = true;
  scheduler.startMediaCheck = (ids, probe, options) => {
    started.push(options.trigger);
    return fail ? { status: 'failed', error: '后端 本机 不在线' } : { status: 'running' };
  };
  try {
    const now = Date.parse('2026-10-11T00:00:00Z');
    scheduler.unlockDue(now);
    assert.deepEqual(started, ['schedule']);
    assert.match(events.list()[0].title, /未能开始/);
    scheduler.unlockDue(now + 30 * 60000);
    assert.equal(started.length, 1, 'waits an hour before retrying');
    fail = false;
    scheduler.unlockDue(now + 61 * 60000);
    assert.equal(started.length, 2);
    assert.ok(events.lastScheduledUnlockAt);
    scheduler.unlockDue(now + 23 * 3600000);
    assert.equal(started.length, 2, 'not again within 24 h');
    scheduler.unlockDue(now + 61 * 60000 + 24 * 3600000);
    assert.equal(started.length, 3);
  } finally {
    restoreConfig();
  }
});

test('the event log and unlock baselines survive a restart', () => {
  const events = tmpEvents();
  events.add({ category: 'node', level: 'error', title: 'A 离线' });
  events.setBaseline('local', 'n1', { netflix: { status: 'blocked', lostSince: 't1' } });
  events.markScheduledUnlock('2026-10-11T00:00:00.000Z');
  events.saveNow();
  const reloaded = new EventLog({ file: events.file });
  assert.equal(reloaded.list()[0].title, 'A 离线');
  assert.equal(reloaded.baseline('local', 'n1').netflix.lostSince, 't1');
  assert.equal(reloaded.lastScheduledUnlockAt, '2026-10-11T00:00:00.000Z');
  assert.deepEqual(reloaded.list({ category: 'unlock' }), []);
});
