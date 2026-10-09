const test = require('node:test');
const assert = require('node:assert/strict');
const { detectRegion, flagToRegion, toRuntimeNode, toRuntimeNodes } = require('../src/services/nodeParser');

const proxy = overrides => ({
  name: '🇯🇵 Tokyo 01', type: 'vless', server: 'a.example.com', port: 443,
  uuid: '12345678-1234-1234-9234-123456789012', ...overrides
});
const source = { id: 'source-1', name: 'Airport', type: 'subscription' };

test('decodes flag emoji into ISO region codes', () => {
  assert.equal(flagToRegion('🇯🇵 日本 01'), 'JP');
  assert.equal(flagToRegion('🇭🇰 HK-02 IEPL'), 'HK');
  assert.equal(flagToRegion('🇬🇧 London'), 'GB');
  assert.equal(flagToRegion('no flag here'), null);
});

test('a flag wins over place names in the same label', () => {
  assert.deepEqual(detectRegion('🇯🇵 香港中转'), { region: 'JP', regionSource: 'flag' });
});

test('falls back to place names and codes when there is no flag', () => {
  assert.deepEqual(detectRegion('香港 BGP 03'), { region: 'HK', regionSource: 'name' });
  assert.deepEqual(detectRegion('TW 台湾 Hinet'), { region: 'TW', regionSource: 'name' });
  assert.deepEqual(detectRegion('Singapore SG-01'), { region: 'SG', regionSource: 'name' });
  assert.deepEqual(detectRegion('London 02'), { region: 'GB', regionSource: 'name' });
  assert.deepEqual(detectRegion('dedicated-01'), { region: null, regionSource: null });
});

test('subscription info entries do not get a region (GB is not Great Britain)', () => {
  assert.equal(detectRegion('剩余流量：120 GB').region, null);
  assert.equal(detectRegion('套餐到期：2026-12-01').region, null);
});

test('runtime nodes carry the detected region', () => {
  const node = toRuntimeNode(proxy(), source);
  assert.equal(node.region, 'JP');
  assert.equal(node.regionSource, 'flag');
});

test('renaming a node keeps its identity, so history and alert state survive', () => {
  const before = toRuntimeNode(proxy({ name: '🇯🇵 Tokyo 01' }), source);
  const after = toRuntimeNode(proxy({ name: '🇯🇵 Tokyo 01 ×0.5 流量倍率' }), source);
  assert.equal(before.id, after.id);
  assert.notEqual(before.proxyName, after.proxyName);
});

test('identical endpoints within one source still get distinct ids and proxy names', () => {
  const nodes = toRuntimeNodes([proxy({ name: 'A' }), proxy({ name: 'A' })], source);
  assert.equal(nodes.length, 2);
  assert.notEqual(nodes[0].id, nodes[1].id);
  assert.notEqual(nodes[0].proxyName, nodes[1].proxyName);
  const again = toRuntimeNodes([proxy({ name: 'A' }), proxy({ name: 'A' })], source);
  assert.deepEqual(again.map(item => item.id), nodes.map(item => item.id));
});
