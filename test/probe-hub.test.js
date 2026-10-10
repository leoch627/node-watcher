require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { ProbeRegistry } = require('../src/probe/registry');
const { ProbeHub } = require('../src/probe/hub');
const { ProbeClient } = require('../src/probe/client');
const { MonitorService } = require('../src/services/monitor');
const { loadOrCreateCertificate } = require('../src/probe/certificate');
const { encode } = require('../src/probe/protocol');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-hub-'));
const certificate = loadOrCreateCertificate(dir);
const waitFor = async (predicate, ms = 5000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

function setup() {
  const store = { probes: [] };
  const registry = new ProbeRegistry({
    config: { getConfig: () => store, saveConfig: () => true },
    localMonitor: new MonitorService({ historyPath: path.join(fs.mkdtempSync(path.join(dir, 'm-')), 'history.json') }),
    localEnabled: true
  });
  const hub = new ProbeHub({ registry, cert: certificate.cert, key: certificate.key, host: '127.0.0.1', port: 0 });
  hub.fingerprint = certificate.fingerprint;
  return { registry, hub };
}

function client(hub, { id, token, fingerprint = certificate.fingerprint, handlers = {} }) {
  const state = { nodes: [], checks: 0 };
  const instance = new ProbeClient({
    host: '127.0.0.1', port: hub.port, id, token, fingerprint, version: 'test',
    handlers: {
      isReady: () => true,
      loadNodes: async nodes => { state.nodes = nodes; },
      check: async () => {
        state.checks += 1;
        return { mihomoReady: true, results: state.nodes.map(node => ({ id: node.id, online: node.id !== 'b', latency: 42, error: node.id === 'b' ? 'Timeout' : null })) };
      },
      media: async (ids, emit) => { for (const nodeId of ids) emit(nodeId, { checkedAt: 't', exit: { ip: '1.2.3.4', region: 'JP' }, services: {} }); return { errors: 0 }; },
      ...handlers
    }
  });
  instance.state = state;
  return instance;
}

const nodes = [{ id: 'a', name: 'A', proxyName: 'A · 1', proxy: { name: 'A · 1', type: 'ss' } }, { id: 'b', name: 'B', proxyName: 'B · 2', proxy: { name: 'B · 2', type: 'ss' } }];

test('a probe with a valid token connects, receives nodes and runs checks and media jobs', async t => {
  const { registry, hub } = setup();
  await hub.start();
  const { probe, token } = registry.create('Shanghai');
  hub.broadcastNodes(nodes);
  const agent = client(hub, { id: probe.id, token });
  t.after(async () => { agent.stop(); await hub.stop(); });
  const connected = [];
  hub.on('connect', item => connected.push(item.id));
  agent.start();
  await waitFor(() => agent.state.nodes.length === 2 && hub.sessionInfo(probe.id)?.nodesRevision === 1);
  assert.deepEqual(connected, [probe.id]);
  assert.equal(agent.state.nodes[0].proxy.type, 'ss');
  assert.equal(hub.sessionInfo(probe.id).version, 'test');

  const outcome = await hub.runCheck(probe.id, { timeout: 1000, retries: 0, concurrency: 4 });
  assert.equal(outcome.mihomoReady, true);
  assert.deepEqual(outcome.results.map(item => [item.id, item.online]), [['a', true], ['b', false]]);

  const items = [];
  const done = await hub.runMedia(probe.id, ['a'], (nodeId, media) => items.push([nodeId, media.exit.region]));
  assert.deepEqual(items, [['a', 'JP']]);
  assert.equal(done.errors, 0);

  hub.broadcastNodes([nodes[0]]);
  await waitFor(() => agent.state.nodes.length === 1);
});

test('wrong tokens are rejected and repeated failures block the address', async t => {
  const { registry, hub } = setup();
  await hub.start();
  const { probe } = registry.create('Tokyo');
  t.after(async () => { await hub.stop(); });
  const fatal = [];
  const agent = client(hub, { id: probe.id, token: 'wrong' });
  agent.on('fatal', error => fatal.push(error.message));
  agent.start();
  await waitFor(() => fatal.length > 0);
  agent.stop();
  assert.match(fatal[0], /Authentication failed/);
  assert.equal(hub.connectedIds().length, 0);
  for (let i = 0; i < 12; i += 1) hub.noteFailure('::ffff:127.0.0.1');
  assert.equal(hub.blocked('::ffff:127.0.0.1'), true);
});

test('a probe refuses a master whose certificate does not match the pinned fingerprint', async t => {
  const { registry, hub } = setup();
  await hub.start();
  const { probe, token } = registry.create('Paris');
  t.after(async () => { await hub.stop(); });
  const agent = client(hub, { id: probe.id, token, fingerprint: 'ab'.repeat(32) });
  let connected = false;
  agent.on('connected', () => { connected = true; });
  agent.start();
  await new Promise(resolve => setTimeout(resolve, 600));
  agent.stop();
  assert.equal(connected, false);
  assert.equal(hub.connectedIds().length, 0);
});

test('disabled or removed probes cannot connect, and a reconnect replaces the old session', async t => {
  const { registry, hub } = setup();
  await hub.start();
  const { probe, token } = registry.create('Frankfurt');
  t.after(async () => { await hub.stop(); });
  const disconnects = [];
  hub.on('disconnect', item => disconnects.push(item.id));

  const first = client(hub, { id: probe.id, token });
  first.start();
  await waitFor(() => hub.connectedIds().includes(probe.id));
  const second = client(hub, { id: probe.id, token });
  second.start();
  await waitFor(() => second.connected);
  first.stop();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(hub.connectedIds(), [probe.id]);
  assert.deepEqual(disconnects, [], 'a replaced session is not reported as a disconnect');

  registry.update(probe.id, { enabled: false });
  await waitFor(() => hub.connectedIds().length === 0);
  second.stop();
  assert.deepEqual(disconnects, [probe.id]);
  assert.equal(registry.authenticate(probe.id, token), null);
  registry.update(probe.id, { enabled: true });
  assert.ok(registry.authenticate(probe.id, token));
  const rotated = registry.rotateToken(probe.id);
  assert.equal(registry.authenticate(probe.id, token), null);
  assert.ok(registry.authenticate(probe.id, rotated));
  assert.equal(registry.remove(probe.id), true);
  assert.equal(registry.authenticate(probe.id, rotated), null);
});

test('unauthenticated peers cannot send large frames', async t => {
  const { hub } = setup();
  await hub.start();
  t.after(async () => { await hub.stop(); });
  const socket = tls.connect({ host: '127.0.0.1', port: hub.port, rejectUnauthorized: false });
  await new Promise(resolve => socket.once('secureConnect', resolve));
  const closed = new Promise(resolve => socket.once('close', resolve));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(1024 * 1024, 0);
  socket.write(header);
  await closed;
  assert.equal(hub.connectedIds().length, 0);
  assert.equal(hub.handshakes, 0);
  const second = tls.connect({ host: '127.0.0.1', port: hub.port, rejectUnauthorized: false });
  await new Promise(resolve => second.once('secureConnect', resolve));
  const reply = new Promise(resolve => second.once('data', resolve));
  second.write(encode({ t: 'status' }));
  assert.match((await reply).toString(), /Expected hello/);
  second.destroy();
});

test('a probe that gets replaced or rejected backs off instead of fighting for the connection', async t => {
  const { registry, hub } = setup();
  await hub.start();
  const { probe, token } = registry.create('Duplicate');
  t.after(async () => { await hub.stop(); });
  const first = client(hub, { id: probe.id, token });
  first.start();
  await waitFor(() => first.connected);
  const second = client(hub, { id: probe.id, token });
  second.start();
  await waitFor(() => second.connected && !first.connected);
  assert.equal(first.slowRetry, true, 'the replaced probe waits minutes, not seconds');
  assert.equal(second.slowRetry, false);
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { delays.push(ms); return { unref() {} }; };
  try { first.scheduleReconnect(); } finally { global.setTimeout = originalSetTimeout; }
  assert.ok(delays[0] >= 3.5 * 60000, `reconnect delay ${delays[0]}`);
  first.stop();
  second.stop();
});

test('probe changes are rolled back when the configuration cannot be saved', () => {
  const store = { probes: [] };
  let writable = true;
  const registry = new ProbeRegistry({
    config: { getConfig: () => store, saveConfig: () => writable },
    localMonitor: new MonitorService({ historyPath: path.join(fs.mkdtempSync(path.join(dir, 'r-')), 'history.json') })
  });
  const { probe, token } = registry.create('Kept');
  writable = false;
  assert.throws(() => registry.create('Lost'), /Could not save/);
  assert.deepEqual(store.probes.map(item => item.name), ['Kept']);
  assert.throws(() => registry.rotateToken(probe.id), /Could not save/);
  assert.ok(registry.authenticate(probe.id, token), 'old token still valid');
  assert.throws(() => registry.update(probe.id, { name: 'Renamed', enabled: false }), /Could not save/);
  assert.equal(registry.find(probe.id).name, 'Kept');
  assert.equal(registry.find(probe.id).enabled, true);
  assert.throws(() => registry.remove(probe.id), /Could not save/);
  assert.ok(registry.find(probe.id), 'still present');
  writable = true;
  assert.equal(registry.remove(probe.id), true);
  assert.equal(store.probes.length, 0);
});

test('the TLS handshake itself is bounded, not just the authentication step', async t => {
  const store = { probes: [] };
  const registry = new ProbeRegistry({
    config: { getConfig: () => store, saveConfig: () => true },
    localMonitor: new MonitorService({ historyPath: path.join(fs.mkdtempSync(path.join(dir, 'h-')), 'history.json') })
  });
  const hub = new ProbeHub({ registry, cert: certificate.cert, key: certificate.key, host: '127.0.0.1', port: 0, handshakeTimeoutMs: 300 });
  await hub.start();
  t.after(async () => { await hub.stop(); });
  // A peer that opens TCP but never starts the TLS handshake must be dropped by the server.
  const started = Date.now();
  const socket = require('node:net').connect(hub.port, '127.0.0.1');
  await new Promise(resolve => socket.once('close', resolve));
  assert.ok(Date.now() - started < 3000, `closed after ${Date.now() - started} ms`);
});
