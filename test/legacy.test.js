const { dir } = require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cleanupLegacy } = require('../src/utils/legacy');

test('leftovers of the TLS probe protocol and mihomo are removed once, current data is kept', () => {
  const dataDir = fs.mkdtempSync(path.join(dir, 'legacy-'));
  for (const name of ['history-p-1a2b3c4d.json', 'history-m-12345678.json', 'history.json']) fs.writeFileSync(path.join(dataDir, name), '{}');
  fs.mkdirSync(path.join(dataDir, 'probe-tls'));
  fs.writeFileSync(path.join(dataDir, 'probe-tls', 'key.pem'), 'x');
  fs.mkdirSync(path.join(dataDir, 'mihomo'));
  let saved = 0;
  const store = { cfg: { probes: [{ id: 'p-1', tokenHash: 'h' }], subscriptions: [] }, getConfig() { return this.cfg; }, saveConfig() { saved += 1; return true; } };
  const removed = cleanupLegacy({ store, dataDir });
  assert.deepEqual(removed.sort(), ['config.probes', 'history-p-1a2b3c4d.json', 'mihomo/', 'probe-tls/'].sort());
  assert.equal(store.cfg.probes, undefined);
  assert.equal(saved, 1);
  assert.deepEqual(fs.readdirSync(dataDir).sort(), ['history-m-12345678.json', 'history.json']);
  assert.deepEqual(cleanupLegacy({ store, dataDir }), [], 'nothing left the second time');
});
