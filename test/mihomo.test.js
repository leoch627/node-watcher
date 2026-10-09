const test = require('node:test');
const assert = require('node:assert/strict');
const { MihomoService } = require('../src/services/mihomo');

test('uses a contiguous high port range for Mihomo services', () => {
  const service = new MihomoService({
    httpPort: 23333,
    socksPort: 23334,
    controllerPort: 23335,
    workDir: '/tmp/node-watcher-mihomo-test'
  });
  const config = service.buildConfig();

  assert.equal(config.port, 23333);
  assert.equal(config['socks-port'], 23334);
  assert.equal(config['external-controller'], '127.0.0.1:23335');
  assert.equal(service.apiUrl, 'http://127.0.0.1:23335');
  assert.equal(service.getProxyUrl(), 'http://127.0.0.1:23333');
});

test('derives adjacent SOCKS and controller ports from an HTTP override', () => {
  const service = new MihomoService({ httpPort: 24000, workDir: '/tmp/node-watcher-mihomo-test' });

  assert.equal(service.socksPort, 24001);
  assert.equal(service.controllerPort, 24002);
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');

const proxyNode = name => ({ proxyName: name, proxy: { name, type: 'ss', server: `${name}.example.com`, port: 443, cipher: 'aes-128-gcm', password: 'pw' } });
const tmpWorkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-mihomo-'));

test('extra media slots each get their own select group and local listener', () => {
  const service = new MihomoService({ httpPort: 24000, mediaSlots: 3, workDir: tmpWorkDir() });
  const config = service.buildConfig([proxyNode('A'), proxyNode('B')]);
  assert.deepEqual(config['proxy-groups'].map(group => group.name), ['NODE-WATCHER', 'NODE-WATCHER-1', 'NODE-WATCHER-2']);
  assert.deepEqual(config.listeners.map(item => [item.port, item.proxy]), [[24010, 'NODE-WATCHER-1'], [24011, 'NODE-WATCHER-2']]);
  assert.equal(service.getProxyUrl(0), 'http://127.0.0.1:24000');
  assert.equal(service.getProxyUrl(2), 'http://127.0.0.1:24011');
  const single = new MihomoService({ httpPort: 24000, workDir: tmpWorkDir() }).buildConfig([proxyNode('A')]);
  assert.equal(single.listeners, undefined);
});

test('probes made while the core is not ready are skipped, not reported as offline', async () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  const outcome = await service.testNode('A', 1000);
  assert.equal(outcome.skipped, true);
  assert.equal(outcome.online, null);
});

test('a proxy missing in the core is skipped while real probe failures are offline', async () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  service.ready = true;
  const original = axios.get;
  try {
    axios.get = async () => { throw Object.assign(new Error('Not Found'), { response: { status: 404, data: {} } }); };
    assert.equal((await service.testNode('A', 1000)).skipped, true);
    axios.get = async () => { throw Object.assign(new Error('failed'), { response: { status: 504, data: { message: 'Timeout' } } }); };
    const failed = await service.testNode('A', 1000);
    assert.equal(failed.online, false);
    assert.equal(failed.error, 'Timeout');
    assert.equal(failed.skipped, undefined);
    axios.get = async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); };
    assert.equal((await service.testNode('A', 1000)).skipped, true);
  } finally {
    axios.get = original;
  }
});

test('a custom probe URL is passed to the core, and invalid ones fall back to the default', async () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  service.ready = true;
  const original = axios.get;
  const seen = [];
  try {
    axios.get = async (url, options) => { seen.push(options.params.url); return { data: { delay: 42 } }; };
    assert.equal((await service.testNode('A', 1000, 'https://example.com/204')).latency, 42);
    await service.testNode('A', 1000, 'ftp://example.com');
    await service.testNode('A', 1000);
  } finally {
    axios.get = original;
  }
  assert.deepEqual(seen, ['https://example.com/204', 'https://www.gstatic.com/generate_204', 'https://www.gstatic.com/generate_204']);
});

test('the running core is only reloaded when the generated config changes', async () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  service.ready = true;
  const original = axios.put;
  let reloads = 0;
  axios.put = async () => { reloads += 1; return { data: {} }; };
  try {
    await service.updateProxies([proxyNode('A')]);
    await service.updateProxies([proxyNode('A')]);
    assert.equal(reloads, 1);
    await service.updateProxies([proxyNode('A'), proxyNode('B')]);
    assert.equal(reloads, 2);
  } finally {
    axios.put = original;
  }
  assert.equal(service.currentNodes.length, 2);   // remembered, so a restarted core comes back with them
});

test('a failed reload is retried on the next refresh instead of being treated as applied', async () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  service.ready = true;
  const original = axios.put;
  let calls = 0;
  axios.put = async () => { calls += 1; if (calls === 1) throw new Error('socket hang up'); return { data: {} }; };
  try {
    await assert.rejects(() => service.updateProxies([proxyNode('A')]), /socket hang up/);
    await service.updateProxies([proxyNode('A')]);
    assert.equal(calls, 2);
  } finally {
    axios.put = original;
  }
});

test('the core is restarted with backoff after it exits unexpectedly', () => {
  const service = new MihomoService({ workDir: tmpWorkDir() });
  const timers = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { timers.push(ms); return { unref() {} }; };
  try {
    service.scheduleRestart('exit code 1');
    service.restartTimer = null;          // pretend the first timer fired
    service.scheduleRestart('exit code 1');
    service.restartTimer = null;
    service.scheduleRestart('exit code 1');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  assert.deepEqual(timers, [1000, 2000, 4000]);
  service.restartTimer = null;
  service.stop();
  service.scheduleRestart('after stop');
  assert.equal(service.restartTimer, null);   // no restart once stopped on purpose
});
