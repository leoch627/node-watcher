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
