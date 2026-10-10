require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConfigManager } = require('../src/utils/config');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-config-'));
const goodConfig = name => ({
  server: { port: 3000 }, monitoring: { checkIntervalMinutes: 1 },
  subscriptions: [{ id: 's1', name, url: 'https://example.com/sub', enabled: true }],
  notifications: { bark: { enabled: false, url: '' } }
});

test('a missing file yields the defaults', () => {
  const manager = new ConfigManager(path.join(tmpDir(), 'config.json'));
  assert.deepEqual(manager.config.subscriptions, []);
  assert.equal(manager.config.monitoring.failureThreshold, 2);
});

test('configs written by older versions get the new monitoring keys and all notification channels', () => {
  const file = path.join(tmpDir(), 'config.json');
  fs.writeFileSync(file, JSON.stringify(goodConfig('Airport')));
  const config = new ConfigManager(file).config;
  assert.equal(config.monitoring.checkIntervalMinutes, 1);        // explicit value wins
  assert.equal(config.monitoring.failureThreshold, 2);            // new key gets its default
  assert.equal(config.monitoring.subscriptionRefreshMinutes, 30);
  assert.ok(config.notifications.email.auth);
  assert.ok(config.notifications.telegram);
  assert.equal(config.subscriptions[0].name, 'Airport');
});

test('a corrupt config is moved aside and never overwritten by the next save', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, '{"subscriptions": [broken');
  const manager = new ConfigManager(file);
  assert.deepEqual(manager.config.subscriptions, []);
  const corrupt = fs.readdirSync(dir).find(name => name.startsWith('config.json.corrupt-'));
  assert.ok(corrupt);
  manager.addNodeExclusion('x');
  assert.equal(fs.readFileSync(path.join(dir, corrupt), 'utf8'), '{"subscriptions": [broken');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).excludeNodes, ['x']);
});

test('a corrupt config is restored from the backup when there is one', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(`${file}.bak`, JSON.stringify(goodConfig('From backup')));
  fs.writeFileSync(file, 'garbage');
  const manager = new ConfigManager(file);
  assert.equal(manager.config.subscriptions[0].name, 'From backup');
});

test('saving keeps the previous version as a backup and leaves no temp files', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify(goodConfig('First')));
  const manager = new ConfigManager(file);
  manager.updateSubscription('s1', { name: 'Second' });
  manager.updateSubscription('s1', { name: 'Third' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).subscriptions[0].name, 'Third');
  assert.equal(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).subscriptions[0].name, 'Second');
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')), []);
});
