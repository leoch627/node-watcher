require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MonitorService } = require('../src/services/monitor');

const HOUR = 3600000;
const tmpHistory = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-history-')), 'history.json');
const node = id => ({ id, name: `Node ${id}`, proxyName: `Node ${id}`, protocol: 'vless', server: `${id}.example.com`, port: 443, proxy: {} });
const up = { online: true, responseTime: 50, lastCheck: 'now' };
const down = { online: false, responseTime: null, lastCheck: 'now', error: 'timeout' };

test('offline alerts need consecutive failures, and recovery only follows a sent alert', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('a');
  const opts = { failureThreshold: 2 };
  svc.syncNodes([n]);

  assert.equal(svc.updateNodeStatus(n, up, opts).alertEvent, null);
  const first = svc.updateNodeStatus(n, down, opts);
  assert.equal(first.alertEvent, null);
  assert.equal(first.consecutiveFailures, 1);
  assert.equal(first.online, false);                       // the dashboard still shows it offline right away
  const second = svc.updateNodeStatus(n, down, opts);
  assert.equal(second.alertEvent, 'offline');
  // not committed yet (e.g. suppressed): the event stays pending
  assert.equal(svc.updateNodeStatus(n, down, opts).alertEvent, 'offline');
  svc.markAlertSent('a', 'offline');
  assert.equal(svc.updateNodeStatus(n, down, opts).alertEvent, null);
  assert.equal(svc.updateNodeStatus(n, up, opts).alertEvent, 'recovered');
  svc.markAlertSent('a', 'recovered');
  assert.equal(svc.updateNodeStatus(n, up, opts).alertEvent, null);
});

test('a single failed probe between successes never alerts', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('flap');
  const events = [up, down, up, down, up].map(status => svc.updateNodeStatus(n, status, { failureThreshold: 2 }).alertEvent);
  assert.deepEqual(events, [null, null, null, null, null]);
});

test('nodes that were already offline at startup do not produce offline or recovery alerts', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('dead');
  const events = [down, down, down, up].map(status => svc.updateNodeStatus(n, status, { failureThreshold: 2 }).alertEvent);
  assert.deepEqual(events, [null, null, null, null]);
});

test('results without a verdict (backend could not test) leave state and history untouched', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('skip');
  svc.syncNodes([n]);
  assert.equal(svc.applyProbeResult(n, { online: null, skipped: true, error: 'backend offline' }), null);
  assert.equal(svc.applyProbeResult(n, null), null);
  assert.equal(svc.getNodeStatus('skip').online, null);
  assert.equal(svc.nodeHistory.size, 0);
});

test('miaospeed results record HTTP latency, RTT and history', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('ms');
  svc.syncNodes([n]);
  const status = svc.applyProbeResult(n, { online: true, latency: 180, rtt: 52 }, { failureThreshold: 2 });
  assert.equal(status.responseTime, 180);
  assert.equal(status.rtt, 52);
  assert.equal(status.checkMethod, 'miaospeed');
  assert.equal(svc.calculateUptime('ms', 24).totalChecks, 1);
  const failed = svc.applyProbeResult(n, { online: false, latency: null, rtt: null, error: '连接超时或失败' });
  assert.equal(failed.online, false);
  assert.equal(failed.rtt, null);
});

test('late results for a node removed by a subscription refresh do not bring it back', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const old = node('old');
  const fresh = node('new');
  svc.syncNodes([old]);
  // the subscription is refreshed while a check that still holds the old node list is running
  svc.syncNodes([fresh]);
  assert.equal(svc.applyProbeResult(old, { online: true, latency: 120 }), null);
  assert.equal(svc.getNodeStatus('old'), undefined);
  assert.deepEqual(svc.getAllStatus().map(status => status.node.id), ['new']);
  assert.equal(svc.nodeHistory.has('old'), false);
  assert.equal(svc.applyProbeResult(fresh, { online: true, latency: 80 }).online, true);
  if (svc.saveTimer) clearTimeout(svc.saveTimer);
});

test('uptime is computed from hourly buckets and old buckets are pruned', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('up');
  const now = Date.UTC(2026, 9, 9, 12, 30, 0);
  svc.recordHistory(n, true, now);
  svc.recordHistory(n, true, now - 60000);
  svc.recordHistory(n, true, now - 120000);
  svc.recordHistory(n, false, now - 180000);
  svc.recordHistory(n, false, now - 30 * HOUR);
  svc.recordHistory(n, true, now - 40 * 24 * HOUR);

  const day = svc.calculateUptime('up', 24, now);
  assert.deepEqual([day.totalChecks, day.onlineChecks, day.uptimePercentage], [4, 3, 75]);
  const two = svc.calculateUptime('up', 48, now);
  assert.deepEqual([two.totalChecks, two.onlineChecks, two.uptimePercentage], [5, 3, 60]);

  svc.pruneHistory(now);
  // the four checks within the same hour share a bucket, the 30h-old check has its own, the 40-day-old one is gone
  assert.equal(Object.keys(svc.nodeHistory.get('up').buckets).length, 2);
  assert.equal(svc.calculateUptime('missing', 24, now), null);
  if (svc.saveTimer) clearTimeout(svc.saveTimer);
});

test('legacy per-check history is migrated to the compact format and backed up', () => {
  const file = tmpHistory();
  const now = Date.now();
  const checks = [0, 1, 2, 3].map(i => ({ timestamp: new Date(now - i * 60000).toISOString(), online: i !== 3 }));
  fs.writeFileSync(file, JSON.stringify({ legacy: { firstCheck: checks[3].timestamp, checks } }));

  const svc = new MonitorService({ historyPath: file });
  const uptime = svc.calculateUptime('legacy', 24);
  assert.equal(uptime.totalChecks, 4);
  assert.equal(uptime.onlineChecks, 3);

  svc.flushSync();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 2);
  assert.ok(saved.nodes.legacy.buckets);
  assert.ok(fs.existsSync(`${file}.v1.bak`));
});

test('an unreadable history file is moved aside instead of being silently overwritten', () => {
  const file = tmpHistory();
  fs.writeFileSync(file, '{not json');
  const svc = new MonitorService({ historyPath: file });
  assert.equal(svc.nodeHistory.size, 0);
  const leftovers = fs.readdirSync(path.dirname(file));
  assert.ok(leftovers.some(name => name.startsWith('history.json.corrupt-')));
});

test('saving history is atomic and flushSync persists a pending save', () => {
  const file = tmpHistory();
  const svc = new MonitorService({ historyPath: file });
  svc.recordHistory(node('x'), true);
  svc.flushSync();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 2);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.tmp')), []);
});

test('an error-only media result keeps the last good result and marks it stale', () => {
  const svc = new MonitorService({ historyPath: tmpHistory() });
  const n = node('media');
  svc.syncNodes([n]);
  const good = { status: 'unlocked', text: '解锁(jp)', region: 'JP' };
  const bad = { status: 'error', text: '未知(超时)', region: null };
  svc.setMediaResult('media', {
    checkedAt: 't1', exit: { ip: '1.1.1.1', region: 'JP' },
    services: { netflix: good, youtube: good, abema: { ...good, regional: true } }
  });
  svc.setMediaResult('media', {
    checkedAt: 't2', exit: { ip: null, region: null },
    services: { netflix: bad, youtube: good, abema: { ...bad, regional: true } }
  });
  const media = svc.getNodeStatus('media').media;
  assert.equal(media.services.netflix.status, 'unlocked');
  assert.equal(media.services.netflix.stale, true);
  assert.equal(media.services.netflix.lastError, '未知(超时)');
  assert.equal(media.services.youtube.stale, undefined);
  assert.equal(media.services.abema.stale, true);
  assert.equal(media.exit.ip, '1.1.1.1');
});
