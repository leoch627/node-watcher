const { dir } = require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/probe/registry');
const scheduler = require('../src/services/scheduler');
const mihomoService = require('../src/services/mihomo');
const notificationService = require('../src/services/notification');
const { ProbeHub } = require('../src/probe/hub');
const { ProbeClient } = require('../src/probe/client');
const { loadOrCreateCertificate } = require('../src/probe/certificate');

const waitFor = async (predicate, ms = 5000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const node = (id, name) => ({ id, name, proxyName: `${name} · ${id}`, protocol: 'ss', server: `${id}.example.com`, port: 443, region: 'JP', proxy: { name: `${name} · ${id}`, type: 'ss' } });

test('the scheduler checks nodes through remote probes and keeps state per probe', async t => {
  const certificate = loadOrCreateCertificate(dir);
  const hub = new ProbeHub({ registry, cert: certificate.cert, key: certificate.key, host: '127.0.0.1', port: 0 });
  await hub.start();
  const sent = [];
  const originals = {
    sendNotification: notificationService.sendNotification,
    sendIncidentNotification: notificationService.sendIncidentNotification,
    ready: mihomoService.ready
  };
  notificationService.sendNotification = async (n, status) => { sent.push([n.name, status.online, status.probeName]); return []; };
  notificationService.sendIncidentNotification = async () => [];
  mihomoService.ready = false; // the local probe is unavailable; only the remote one can check

  const { probe, token } = registry.create('Guangzhou');
  const down = new Set();
  const agent = new ProbeClient({
    host: '127.0.0.1', port: hub.port, id: probe.id, token, fingerprint: certificate.fingerprint,
    handlers: {
      isReady: () => true,
      loadNodes: async () => {},
      check: async () => ({ mihomoReady: true, results: scheduler.nodes.map(item => ({ id: item.id, online: !down.has(item.id), latency: down.has(item.id) ? null : 80, error: down.has(item.id) ? 'Timeout' : null })) }),
      media: async (ids, emit) => { ids.forEach(id => emit(id, { checkedAt: 't', exit: { ip: '5.6.7.8', region: 'JP' }, services: { netflix: { status: 'unlocked', region: 'JP' } } })); return { errors: 0 }; }
    }
  });
  t.after(async () => {
    agent.stop();
    await hub.stop();
    scheduler.stopMonitoring();
    Object.assign(notificationService, { sendNotification: originals.sendNotification, sendIncidentNotification: originals.sendIncidentNotification });
    mihomoService.ready = originals.ready;
    registry.remove(probe.id);
  });

  scheduler.nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => node(id, `Node ${id}`));
  registry.syncNodes(scheduler.nodes);
  hub.broadcastNodes(scheduler.nodes);
  agent.start();
  await waitFor(() => hub.connectedIds().includes(probe.id));

  let job = await scheduler.runHealthCheck();
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.probes.map(item => [item.id, item.status]), [['local', 'skipped'], [probe.id, 'completed']]);
  const remote = registry.monitorFor(probe.id);
  assert.equal(remote.getNodeStatus('a').online, true);
  assert.equal(remote.getNodeStatus('a').checkMethod, 'probe');
  assert.equal(registry.localMonitor.getNodeStatus('a').online, null, 'local state untouched');
  assert.equal(remote.calculateUptime('a', 24).totalChecks, 1);

  down.add('c');
  await scheduler.runHealthCheck();
  job = await scheduler.runHealthCheck();
  assert.deepEqual(sent, [['Node c', false, 'Guangzhou']], 'alert after two failures, labelled with the probe');

  const across = registry.nodeAcrossProbes('c');
  assert.deepEqual(across.map(item => [item.id, item.online]), [['local', null], [probe.id, false]]);

  const media = scheduler.startMediaCheck([], probe.id);
  assert.equal(media.probeId, probe.id);
  await waitFor(() => scheduler.mediaJob.status !== 'running');
  assert.equal(scheduler.mediaJob.status, 'completed');
  assert.equal(scheduler.mediaJob.skipped, 1, 'offline node c skipped');
  assert.equal(remote.getNodeStatus('a').media.services.netflix.status, 'unlocked');
  assert.equal(registry.localMonitor.getNodeStatus('a').media, null);

  const status = scheduler.getStatus();
  const described = status.probes.find(item => item.id === probe.id);
  assert.equal(described.connected, true);
  assert.equal(described.summary.offline, 1);
});

test('a media check on a probe that is not connected fails fast', () => {
  const { probe } = registry.create('Offline');
  const job = scheduler.startMediaCheck([], probe.id);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /not connected/);
  registry.remove(probe.id);
});
