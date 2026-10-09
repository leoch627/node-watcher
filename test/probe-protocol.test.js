const test = require('node:test');
const assert = require('node:assert/strict');
const { encode, FrameDecoder, formatJoin, parseJoin, normalizeFingerprint } = require('../src/probe/protocol');

test('frames survive arbitrary chunking', () => {
  const messages = [{ t: 'hello', id: 'p-1', token: 'x' }, { t: 'nodes', nodes: [{ id: 'a', name: '🇯🇵 东京' }] }, { t: 'ping', ts: 1 }];
  const stream = Buffer.concat(messages.map(encode));
  for (const size of [1, 3, 7, stream.length]) {
    const decoder = new FrameDecoder();
    const out = [];
    for (let i = 0; i < stream.length; i += size) out.push(...decoder.push(stream.subarray(i, i + size)));
    assert.deepEqual(out, messages);
  }
});

test('oversized frames, bad JSON and untyped messages are protocol errors', () => {
  const big = Buffer.alloc(4);
  big.writeUInt32BE(1024 * 1024, 0);
  assert.throws(() => new FrameDecoder(64 * 1024).push(big), /too large/);
  const bad = Buffer.concat([Buffer.from([0, 0, 0, 3]), Buffer.from('{x}')]);
  assert.throws(() => new FrameDecoder().push(bad), /Invalid frame/);
  assert.throws(() => new FrameDecoder().push(encode({ hello: true })), /message type/);
});

test('join strings round-trip, including IPv6 hosts and tokens with special characters', () => {
  const fingerprint = 'AB:'.repeat(31) + 'AB';
  for (const host of ['master.example.com', '203.0.113.7', '2001:db8::7']) {
    const join = formatJoin({ id: 'p-12ab34cd', token: 'a/b+c=d', host, port: 7443, fingerprint });
    const parsed = parseJoin(join);
    assert.deepEqual(parsed, { id: 'p-12ab34cd', token: 'a/b+c=d', host, port: 7443, fingerprint: 'ab'.repeat(32) });
  }
  assert.equal(parseJoin('nwp://p-1:tok@host').port, 7443);
  assert.equal(parseJoin('nwp://p-1:tok@host').fingerprint, null);
  assert.throws(() => parseJoin('https://p-1:tok@host'), /nwp:\/\//);
  assert.throws(() => parseJoin('nwp://host:7443'), /missing/);
  assert.throws(() => parseJoin('nwp://p-1:tok@host?fp=abc'), /fingerprint/);
  assert.equal(normalizeFingerprint('sha256:' + 'Ab'.repeat(32)), 'ab'.repeat(32));
});
