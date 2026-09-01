const test = require('node:test');
const assert = require('node:assert/strict');
const monitorService = require('../src/services/monitor');

const node = id => ({
  id,
  name: `Node ${id}`,
  proxyName: `Node ${id}`,
  protocol: 'vless',
  server: `${id}.example.com`,
  port: 443,
  subscription: 'Test',
  proxy: { password: 'secret' }
});

test.beforeEach(() => monitorService.nodeStatus.clear());

test('shows loaded nodes as pending before their first health check', () => {
  monitorService.syncNodes([node('one'), node('two')]);

  assert.equal(monitorService.getAllStatus().length, 2);
  assert.equal(monitorService.getPendingNodes().length, 2);
  assert.equal(monitorService.getOnlineNodes().length, 0);
  assert.equal(monitorService.getOfflineNodes().length, 0);
  assert.equal(monitorService.getNodeStatus('one').online, null);
  assert.equal(monitorService.getNodeStatus('one').node.proxy, undefined);
});

test('first result establishes a baseline without reporting a status change', () => {
  monitorService.syncNodes([node('one')]);

  const first = monitorService.updateNodeStatus(node('one'), { online: false, lastCheck: 'first' });
  const recovered = monitorService.updateNodeStatus(node('one'), { online: true, lastCheck: 'second' });

  assert.equal(first.statusChanged, false);
  assert.equal(first.previousStatus, null);
  assert.equal(recovered.statusChanged, true);
  assert.equal(recovered.previousStatus, false);
});

test('sync updates node metadata and removes nodes no longer loaded', () => {
  monitorService.syncNodes([node('one'), node('two')]);
  monitorService.updateNodeStatus(node('one'), { online: true, lastCheck: 'now' });
  const renamed = { ...node('one'), name: 'Renamed' };

  monitorService.syncNodes([renamed]);

  assert.equal(monitorService.getAllStatus().length, 1);
  assert.equal(monitorService.getNodeStatus('one').node.name, 'Renamed');
  assert.equal(monitorService.getNodeStatus('one').online, true);
});
