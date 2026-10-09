require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const { SchedulerService } = require('../src/services/scheduler');
const subscriptionService = require('../src/services/subscription');
const notificationService = require('../src/services/notification');
const monitorService = require('../src/services/monitor');
const mihomoService = require('../src/services/mihomo');
const mediaService = require('../src/services/media');

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

function alertHarness() {
  const calls = { single: [], batch: [], incident: [], marked: [] };
  const restoreNotification = stub(notificationService, {
    sendNotification: async (node, status) => { calls.single.push([node.id, status.online, status.statusChanged]); return []; },
    sendBatchNotification: async (kind, entries) => { calls.batch.push([kind, entries.length]); return []; },
    sendIncidentNotification: async (info, resolved) => { calls.incident.push([info.failing, info.total, resolved]); return []; }
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

test('health checks are skipped, not recorded as failures, while the core is not ready', async () => {
  const scheduler = new SchedulerService();
  scheduler.nodes = [sample('a')];
  const originalReady = mihomoService.ready;
  mihomoService.ready = false;
  const restore = stub(monitorService, { checkAll: async () => { throw new Error('must not probe'); } });
  try {
    const job = await scheduler.runHealthCheck();
    assert.equal(job.status, 'skipped');
    assert.equal(job.error, 'Mihomo is not ready');
  } finally {
    restore();
    mihomoService.ready = originalReady;
  }
});

test('media checks skip offline nodes and keep their earlier results', async () => {
  const scheduler = new SchedulerService();
  const nodes = [sample('up'), sample('down')].map(item => ({ ...item, proxyName: item.name }));
  monitorService.syncNodes(nodes);
  monitorService.updateNodeStatus(nodes[0], { online: true, responseTime: 10, lastCheck: 'now' });
  monitorService.updateNodeStatus(nodes[1], { online: false, responseTime: null, lastCheck: 'now' });
  const checked = [];
  const restore = stub(mediaService, {
    checkNode: async (node, slot) => { checked.push([node.id, slot]); return { checkedAt: 't', exit: { ip: '1.1.1.1', region: 'JP' }, services: {} }; }
  });
  try {
    const job = { status: 'running', total: 2, completed: 0, errors: 0, skipped: 0 };
    await scheduler.executeMediaJob(job, nodes);
    assert.equal(job.status, 'completed');
    assert.equal(job.skipped, 1);
    assert.equal(job.completed, 2);
    assert.deepEqual(checked, [['up', 0]]);
  } finally {
    restore();
  }
});
