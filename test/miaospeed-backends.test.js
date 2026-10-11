require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const protocol = require('../src/miaospeed/protocol');
const { BackendManager } = require('../src/miaospeed/backends');
const { runForNodes, toTaskNode } = require('../src/miaospeed/tasks');

const memoryStore = () => ({ cfg: {}, getConfig() { return this.cfg; }, saveConfig() { return true; } });
const noLocal = { enabled: false, status: () => ({}), start: async () => {}, shutdown: async () => {} };

async function setup() {
  const manager = new BackendManager({ store: memoryStore(), local: noLocal });
  const server = http.createServer((req, res) => res.writeHead(404).end());
  server.on('upgrade', (req, socket, head) => { if (!manager.handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `ws://127.0.0.1:${server.address().port}`;
  return { manager, server, base, close: () => new Promise(resolve => server.close(resolve)) };
}

// A stand-in for `miaospeed server -connect`: performs the msr-v1 handshake, then answers each task
// by echoing one result per node, the way miaospeed does (progress frames, then the final result).
function fakeMiaospeed(url, token, { nonce = `n-${Math.random()}`, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const ws = new WebSocket(url);
  const seen = [];
  const ready = new Promise((resolve, reject) => {
    ws.once('open', () => ws.send(JSON.stringify({
      Type: 'hello', Protocol: 'msr-v1', Version: 'fake-1', Nonce: nonce, Timestamp: timestamp,
      Sign: protocol.reverseHelloSign(token, nonce, timestamp)
    })));
    ws.once('message', raw => {
      const ack = JSON.parse(String(raw));
      if (ack.Type !== 'ack') return reject(new Error(ack.Error));
      // The client proves it holds the token too.
      const expected = protocol.hashMiaoSpeed(token, protocol.reverseHelloSign(token, nonce, timestamp));
      if (ack.Sign !== expected) return reject(new Error('bad ack signature'));
      ws.on('message', data => {
        const request = JSON.parse(String(data));
        seen.push(request);
        const valid = request.Challenge === protocol.signRequest(request, token);
        if (!valid) return ws.send(JSON.stringify({ Error: 'cannot verify the request, please check your token' }));
        const slots = request.Nodes.map(node => ({
          ProxyInfo: { Name: node.Payload.match(/^name: (.*)$/m)[1].replace(/'/g, ''), Address: 'x:1', Type: 'Vless' },
          Matrices: [{ Type: 'TEST_PING_RTT', Payload: '{"Value":42}' }]
        }));
        // Completion order differs from request order, like the real backend.
        for (const slot of [...slots].reverse()) ws.send(JSON.stringify({ ID: 'x', Progress: { Record: slot, Index: 0, Queuing: 0 } }));
        ws.send(JSON.stringify({ ID: 'x', MiaoSpeedVersion: 'fake-1', Result: { Request: request, Results: slots } }));
      });
      resolve(ack);
    });
    ws.once('error', reject);
    ws.once('close', () => reject(new Error('closed')));
  });
  return { ws, ready, seen };
}

test('reverse backends complete the msr-v1 handshake and run signed tasks', async t => {
  const { manager, base, close } = await setup();
  const record = manager.create({ name: 'pi', type: 'reverse' });
  const fake = fakeMiaospeed(`${base}/miaospeed/reverse/${record.id}`, record.token);
  t.after(async () => { fake.ws.terminate(); await close(); });
  const ack = await fake.ready;
  assert.equal(ack.Pool, 3);
  assert.equal(manager.get(record.id).online, true);

  const nodes = [
    { id: 'aaa', name: '🇭🇰 HK', proxy: { name: '🇭🇰 HK', type: 'ss', server: '1.1.1.1', port: 1, cipher: 'aes-128-gcm', password: 'p' } },
    { id: 'bbb', name: '🇯🇵 JP', proxy: { name: '🇯🇵 JP', type: 'ss', server: '2.2.2.2', port: 2, cipher: 'aes-128-gcm', password: 'p' } }
  ];
  const streamed = [];
  const outcome = await runForNodes(record.id, nodes, { matrices: ['TEST_PING_RTT'], manager, onResult: id => streamed.push(id) });
  // Results map back to node ids even though the backend answered out of order.
  assert.deepEqual(streamed, ['bbb', 'aaa']);
  assert.equal(outcome.results.get('aaa').rtt, 42);
  assert.equal(outcome.version, 'fake-1');
  // The proxy is renamed to the node id so results can be mapped back.
  assert.match(fake.seen[0].Nodes[0].Payload, /^name: aaa$/m);
});

test('reverse links with a wrong token or a replayed nonce are rejected', async () => {
  const { manager, base, close } = await setup();
  const record = manager.create({ name: 'pi', type: 'reverse' });
  const url = `${base}/miaospeed/reverse/${record.id}`;
  await assert.rejects(fakeMiaospeed(url, 'wrong-token').ready, /signature mismatch/);
  const first = fakeMiaospeed(url, record.token, { nonce: 'same', timestamp: Math.floor(Date.now() / 1000) });
  await first.ready;
  await assert.rejects(fakeMiaospeed(url, record.token, { nonce: 'same', timestamp: Math.floor(Date.now() / 1000) }).ready, /replayed/);
  first.ws.close();
  await close();
});

test('unknown or disabled reverse backends get 404, other paths are left alone', async () => {
  const { manager, base, close } = await setup();
  const record = manager.create({ name: 'pi', type: 'reverse' });
  manager.update(record.id, { enabled: false });
  for (const id of [record.id, 'm-nothere']) {
    const status = await new Promise(resolve => {
      const ws = new WebSocket(`${base}/miaospeed/reverse/${id}`);
      ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
      ws.on('error', () => resolve('error'));
    });
    assert.equal(status, 404);
  }
  assert.equal(manager.handleUpgrade({ url: '/elsewhere' }, null, null), false);
  await close();
});

test('tasks waiting for a busy reverse backend fail fast when it disconnects', async () => {
  const { manager, base, close } = await setup();
  const record = manager.create({ name: 'pi', type: 'reverse' });
  const fake = fakeMiaospeed(`${base}/miaospeed/reverse/${record.id}`, record.token);
  await fake.ready;
  const [session] = manager.reverse.get(record.id);
  session.busy = true;
  const waiting = manager.acquire(record.id);
  fake.ws.close();
  await assert.rejects(waiting, /已断开/);
  await assert.rejects(manager.runTask(record.id, { matrices: [], nodes: [] }), /未连接/);
  await close();
});

test('forward backends are validated and tokens never appear in list()', () => {
  const manager = new BackendManager({ store: memoryStore(), local: noLocal });
  assert.throws(() => manager.create({ name: 'x', type: 'forward', url: 'http://a', token: 't' }), /ws:\/\//);
  assert.throws(() => manager.create({ name: 'x', type: 'forward', url: 'ws://a', token: '' }), /token/);
  assert.throws(() => manager.create({ name: 'x', type: 'forward', url: 'ws://a', token: 't', fingerprint: 'zz' }), /fingerprint/);
  manager.create({ name: 'sh', type: 'forward', url: 'wss://a.example:8765/p', token: 'secret', fingerprint: 'AB'.repeat(32) });
  const listed = JSON.stringify(manager.list());
  assert.ok(!listed.includes('secret'));
  assert.ok(listed.includes('"pinned":true'));
});

test('task nodes carry the node id as proxy name', () => {
  const node = toTaskNode({ id: 'abc', proxy: { name: 'x', type: 'ss', server: 's', port: 1 } });
  assert.equal(node.name, 'abc');
  assert.match(node.payload, /^name: abc$/m);
});

test('deploy commands are shell-safe even with a hostile Host header', () => {
  const { connectInfo } = require('../src/routes/backends');
  const req = host => ({ protocol: 'https', get: () => host });
  const record = { id: 'm-1', token: 'tok_en-1' };
  const ok = connectInfo(req('monitor.example.com'), record);
  assert.equal(ok.url, 'wss://monitor.example.com/miaospeed/reverse/m-1');
  assert.match(ok.scriptBinary, /probe --mode binary --connect 'wss:\/\/monitor\.example\.com\/miaospeed\/reverse\/m-1' --token 'tok_en-1'$/);
  for (const host of ["a.example.com';reboot;'", 'a.example.com$(id)', 'a b', '']) {
    const info = connectInfo(req(host), record);
    for (const command of [info.script, info.scriptBinary, info.docker, info.binary]) {
      assert.ok(!/reboot|\$\(|';/.test(command.replace(/'[^']*'/g, '')), command);
    }
    assert.equal(info.url, 'ws://localhost/miaospeed/reverse/m-1');
  }
});

test('every backend has an enable and a health-check switch; the local engine stops while disabled', async () => {
  const calls = [];
  const local = {
    enabled: true, ready: true, url: 'ws://127.0.0.1:1/x', token: 't',
    status: () => ({ ready: true, version: '4.7.8', error: null }),
    start: async () => { calls.push('start'); }, shutdown: async () => { calls.push('shutdown'); }
  };
  const store = memoryStore();
  const manager = new BackendManager({ store, local });
  assert.deepEqual(manager.list().map(item => [item.id, item.enabled, item.monitor]), [['local', true, true]]);

  manager.update('local', { monitor: false });
  assert.equal(manager.get('local').monitor, false);
  assert.equal(manager.get('local').enabled, true);
  assert.deepEqual(calls, []);

  manager.update('local', { enabled: false });
  assert.deepEqual(calls, ['shutdown']);
  assert.equal(store.cfg.miaospeed.local.enabled, false);
  assert.equal(manager.get('local').online, null);
  assert.equal(manager.available().length, 0);
  await assert.rejects(manager.runTask('local', {}), /已停用/);
  // A restart keeps it off.
  const restarted = new BackendManager({ store, local });
  await restarted.start();
  await restarted.stop();
  assert.deepEqual(calls, ['shutdown', 'shutdown']);

  manager.update('local', { enabled: true });
  assert.deepEqual(calls, ['shutdown', 'shutdown', 'start']);

  const reverse = manager.create({ name: 'r', type: 'reverse', monitor: false });
  assert.equal(manager.get(reverse.id).monitor, false);
  manager.update(reverse.id, { monitor: true, enabled: false });
  assert.deepEqual([manager.get(reverse.id).enabled, manager.get(reverse.id).monitor], [false, true]);
});

test('forward TLS settings are validated, kept on partial updates and never listed', () => {
  const { generateMtlsBundle } = require('../src/utils/certs');
  const bundle = generateMtlsBundle({ hosts: ['ms.example.com'] });
  const other = generateMtlsBundle({ hosts: ['ms.example.com'] });
  const manager = new BackendManager({ store: memoryStore(), local: noLocal });
  const base = { name: 'x', type: 'forward', url: 'wss://ms.example.com:8765/p', token: 't' };
  assert.throws(() => manager.create({ ...base, url: 'ws://ms.example.com:1', ca: bundle.ca }), /wss:\/\//);
  assert.throws(() => manager.create({ ...base, ca: 'nope' }), /PEM/);
  assert.throws(() => manager.create({ ...base, clientCert: bundle.clientCert }), /同时提供/);
  assert.throws(() => manager.create({ ...base, clientCert: bundle.clientCert, clientKey: other.clientKey }), /不匹配/);
  assert.throws(() => manager.create({ ...base, ca: bundle.ca, fingerprint: 'AB'.repeat(32) }), /只能选一种/);
  const record = manager.create({ ...base, ca: bundle.ca, clientCert: bundle.clientCert, clientKey: bundle.clientKey, servername: 'ms.example.com' });
  const listed = manager.get(record.id);
  assert.deepEqual([listed.customCa, listed.mtls, listed.pinned, listed.servername], [true, true, false, 'ms.example.com']);
  assert.ok(!JSON.stringify(manager.list()).includes('PRIVATE KEY'));
  // Undefined keeps, '' clears.
  manager.update(record.id, { name: 'y' });
  assert.equal(manager.get(record.id).mtls, true);
  manager.update(record.id, { clientCert: '', clientKey: '' });
  assert.deepEqual([manager.get(record.id).mtls, manager.get(record.id).customCa], [false, true]);
  manager.update(record.id, { ca: '', fingerprint: 'cd'.repeat(32) });
  assert.deepEqual([manager.get(record.id).customCa, manager.get(record.id).pinned], [false, true]);
});

// A wss:// stand-in for `miaospeed server -mtls -serverpublickey … -clientca …`: same TLS settings
// (client certificates verified when presented, connections without one allowed).
async function tlsServer(bundle) {
  const https = require('node:https');
  const server = https.createServer({ cert: bundle.serverCert, key: bundle.serverKey, ca: bundle.ca, requestCert: true, rejectUnauthorized: false });
  const wss = new WebSocket.WebSocketServer({ noServer: true });
  const peers = [];
  server.on('upgrade', (req, socket, head) => {
    if (req.socket.getPeerCertificate()?.subject && !req.socket.authorized) return socket.destroy();
    peers.push(req.socket.authorized ? req.socket.getPeerCertificate().subject.CN : null);
    wss.handleUpgrade(req, socket, head, ws => ws.close());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `wss://127.0.0.1:${server.address().port}/p`, peers, close: () => new Promise(resolve => server.close(resolve)) };
}

test('mTLS: generated certificates connect, wrong ones are refused, fingerprints can be read and pinned', async () => {
  const { connect, peekCertificate, normalizeFingerprint } = require('../src/miaospeed/session');
  const { generateMtlsBundle } = require('../src/utils/certs');
  const bundle = generateMtlsBundle({ hosts: ['127.0.0.1'] });
  const stranger = generateMtlsBundle({ hosts: ['127.0.0.1'] });
  const server = await tlsServer(bundle);
  try {
    const socket = await connect(server.url, { ca: bundle.ca, cert: bundle.clientCert, key: bundle.clientKey });
    socket.close();
    assert.equal(server.peers.at(-1), 'node-watcher');
    // Without a client certificate miaospeed still accepts the link (VerifyClientCertIfGiven).
    (await connect(server.url, { ca: bundle.ca })).close();
    assert.equal(server.peers.at(-1), null);
    await assert.rejects(connect(server.url, { ca: bundle.ca, cert: stranger.clientCert, key: stranger.clientKey }));
    await assert.rejects(connect(server.url, { ca: stranger.ca }), /certificate/);
    await assert.rejects(connect(server.url, {}), /certificate/);
    const seen = await peekCertificate(server.url);
    assert.equal(seen.trusted, false);
    assert.equal(seen.fingerprint, normalizeFingerprint(new (require('node:crypto').X509Certificate)(bundle.serverCert).fingerprint256));
    (await connect(server.url, { fingerprint: seen.fingerprint })).close();
    await assert.rejects(connect(server.url, { fingerprint: 'ab'.repeat(32) }), /pinned/);
  } finally {
    await server.close();
  }
});

test('generated certificate sets carry the right names and usages', () => {
  const crypto = require('node:crypto');
  const { generateMtlsBundle } = require('../src/utils/certs');
  const bundle = generateMtlsBundle({ hosts: ['ms.example.com', '203.0.113.9', '2001:db8::1'] });
  const ca = new crypto.X509Certificate(bundle.ca);
  const server = new crypto.X509Certificate(bundle.serverCert);
  const client = new crypto.X509Certificate(bundle.clientCert);
  assert.equal(ca.ca, true);
  assert.equal(server.ca, false);
  assert.ok(server.checkIssued(ca) && server.verify(ca.publicKey) && client.verify(ca.publicKey));
  assert.equal(server.checkHost('ms.example.com'), 'ms.example.com');
  assert.equal(server.checkIP('203.0.113.9'), '203.0.113.9');
  assert.equal(server.checkIP('2001:db8::1'), '2001:db8::1');
  assert.deepEqual(server.keyUsage, ['1.3.6.1.5.5.7.3.1']);
  assert.deepEqual(client.keyUsage, ['1.3.6.1.5.5.7.3.2']);
  assert.ok(server.checkPrivateKey(crypto.createPrivateKey(bundle.serverKey)));
  assert.throws(() => generateMtlsBundle({ hosts: [] }), /域名或 IP/);
  assert.throws(() => generateMtlsBundle({ hosts: ['a b'] }), /无效/);
});

test('the engine counts as ready while the local miaospeed is switched off or not wanted', () => {
  const local = { ...noLocal, enabled: true, ready: false };
  const manager = new BackendManager({ store: memoryStore(), local });
  assert.equal(manager.engineReady(), false);           // wanted, not running: degraded
  manager.localSettings().enabled = false;
  assert.equal(manager.engineReady(), true);            // switched off in the dashboard
  manager.localSettings().enabled = true;
  local.ready = true;
  assert.equal(manager.engineReady(), true);            // running
  local.enabled = false;
  local.ready = false;
  assert.equal(manager.engineReady(), true);            // MIAOSPEED_LOCAL=false
});
