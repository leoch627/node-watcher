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
