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

test('reverse backends complete the msr-v1 handshake and run signed tasks', async () => {
  const { manager, base, close } = await setup();
  const record = manager.create({ name: 'pi', type: 'reverse' });
  const fake = fakeMiaospeed(`${base}/miaospeed/reverse/${record.id}`, record.token);
  const ack = await fake.ready;
  assert.equal(ack.Pool, 2);
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
  fake.ws.close();
  await close();
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
