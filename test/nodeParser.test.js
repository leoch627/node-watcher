const test = require('node:test');
const assert = require('node:assert/strict');
const { parseContent, parseUri, toRuntimeNode } = require('../src/services/nodeParser');

test('parses VLESS Reality links', () => {
  const node = parseUri('vless://12345678-1234-1234-1234-123456789012@example.com:443?security=reality&type=grpc&sni=www.example.com&pbk=public-key&sid=abcd&fp=chrome#Tokyo');
  assert.equal(node.type, 'vless');
  assert.equal(node.name, 'Tokyo');
  assert.equal(node.tls, true);
  assert.equal(node.network, 'grpc');
  assert.equal(node['reality-opts']['public-key'], 'public-key');
});

test('accepts escaped URI schemes and Hysteria2 alias', () => {
  const node = parseUri('hy2\\://secret@example.com:8443?sni=edge.example.com&insecure=1#HY2');
  assert.equal(node.type, 'hysteria2');
  assert.equal(node.password, 'secret');
  assert.equal(node['skip-cert-verify'], true);
});

test('parses VMess and Shadowsocks links', () => {
  const vmessPayload = Buffer.from(JSON.stringify({
    v: '2', ps: 'VMess', add: 'vmess.example.com', port: '443',
    id: '12345678-1234-1234-1234-123456789012', aid: '0', net: 'ws',
    host: 'cdn.example.com', path: '/ws', tls: 'tls'
  })).toString('base64');
  const vmess = parseUri(`vmess://${vmessPayload}`);
  const credentials = Buffer.from('aes-128-gcm:password').toString('base64');
  const ss = parseUri(`ss://${credentials}@ss.example.com:443#Shadowsocks`);
  assert.equal(vmess['ws-opts'].headers.Host, 'cdn.example.com');
  assert.equal(ss.cipher, 'aes-128-gcm');
  assert.equal(ss.password, 'password');
});

test('parses Base64 subscriptions and reports bad lines', () => {
  const content = [
    'trojan://secret@one.example.com:443?sni=one.example.com#One',
    'unsupported://value'
  ].join('\n');
  const parsed = parseContent(Buffer.from(content).toString('base64'));
  assert.equal(parsed.proxies.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.format, 'links');
});

test('parses Clash YAML and creates source-stable unique runtime names', () => {
  const parsed = parseContent(`proxies:\n  - name: Same\n    type: vless\n    server: one.example.com\n    port: 443\n    uuid: 12345678-1234-1234-9234-123456789012\n  - name: Same\n    type: hysteria2\n    server: two.example.com\n    port: 8443\n    password: pass\n`);
  assert.equal(parsed.proxies.length, 2);
  const source = { id: 'source-1', name: 'Airport', type: 'subscription' };
  const nodes = parsed.proxies.map(proxy => toRuntimeNode(proxy, source));
  assert.notEqual(nodes[0].id, nodes[1].id);
  assert.notEqual(nodes[0].proxyName, nodes[1].proxyName);
  assert.equal(nodes[0].subscription, 'Airport');
});

test('filters incomplete proxies before Mihomo configuration', () => {
  const parsed = parseContent(`proxies:\n  - name: Broken\n    type: vmess\n    server: broken.example.com\n    port: 443\n    uuid: not-a-uuid\n`);
  assert.equal(parsed.proxies.length, 0);
});
