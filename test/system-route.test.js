require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the config at a throwaway file before anything loads it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-route-'));
process.env.CONFIG_FILE = path.join(dir, 'config.json');
fs.writeFileSync(process.env.CONFIG_FILE, JSON.stringify({ monitoring: { checkIntervalMinutes: 5, timeoutSeconds: 10 } }));

const express = require('express');
const router = require('../src/routes/system');
const schedulerService = require('../src/services/scheduler');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/system', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  try {
    await run(base);
  } finally {
    schedulerService.stopMonitoring();
    await new Promise(resolve => server.close(resolve));
  }
}

const put = (base, body) => fetch(`${base}/monitoring`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

test('invalid monitoring settings are rejected and nothing is applied', async () => {
  await withServer(async base => {
    for (const body of [
      { checkIntervalMinutes: 0 }, { retryAttempts: 9 }, { failureThreshold: 0 }, { timeoutSeconds: 11 },
      { timeoutSeconds: 1.5 }, { customHealthCheckUrl: 'ftp://example.com' }, { unifiedDelay: 'yes' }
    ]) {
      const response = await put(base, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    const mixed = await put(base, { retryAttempts: 2, failureThreshold: 99 });
    assert.equal(mixed.status, 400);
    const { config } = await (await fetch(`${base}/config`)).json();
    assert.notEqual(config.monitoring.retryAttempts, 2);
  });
});

test('valid monitoring settings are saved, including the new alerting options', async () => {
  await withServer(async base => {
    const response = await put(base, {
      retryAttempts: 2, failureThreshold: 3, subscriptionRefreshMinutes: 45,
      customHealthCheckUrl: 'https://example.com/generate_204', checkIntervalMinutes: '2', unifiedDelay: false
    });
    assert.equal(response.status, 200);
    const { config } = await (await fetch(`${base}/config`)).json();
    assert.equal(config.monitoring.retryAttempts, 2);
    assert.equal(config.monitoring.failureThreshold, 3);
    assert.equal(config.monitoring.subscriptionRefreshMinutes, 45);
    assert.equal(config.monitoring.checkIntervalMinutes, 2);
    assert.equal(config.monitoring.customHealthCheckUrl, 'https://example.com/generate_204');
    assert.equal(config.monitoring.unifiedDelay, false);
    const onDisk = JSON.parse(fs.readFileSync(process.env.CONFIG_FILE, 'utf8'));
    assert.equal(onDisk.monitoring.failureThreshold, 3);
  });
});
