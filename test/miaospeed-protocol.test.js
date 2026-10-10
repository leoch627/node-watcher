const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../src/miaospeed/protocol');

// Reference values computed with miaospeed's own Go code (utils.SignRequest / utils.SignChallenge,
// json-iterator re-serialization) and the public release build token.
const FIXTURE_REQUEST = () => protocol.buildRequest({
  id: 'fixture-1', version: '2.0.0',
  matrices: ['TEST_PING_RTT', { type: 'TEST_SCRIPT', params: 'netflix' }],
  nodes: [{ name: '🇭🇰 香港 <1> & "x"', payload: 'name: a\ntype: ss\nserver: 1.2.3.4\nport: 8388\n' }],
  configs: { pingAverageOver: 3, dnsServers: ['1.1.1.1'] },
  scripts: [{ id: 'netflix', content: 'function handler(){return {text:"ok"}}', timeout: 5000 }],
  randomSequence: '0123456789abcdef'
});

test('request signatures match the Go implementation byte for byte', () => {
  const request = FIXTURE_REQUEST();
  assert.equal(protocol.signRequest(request, 'tok en'),
    'zQIERSWu9l41uda2M_uiT8IbylmRDf0BueuTyktZAaWgJalcF8oTwKq4LxMRkLtsdjXMQvO5XzPwoQPSylNqRA==');
  // Vendor is not part of the signed clone, so changing it must not change the signature.
  assert.equal(protocol.signRequest({ ...request, Vendor: 'Local' }, 'tok en'), protocol.signRequest(request, 'tok en'));
});

test('reverse handshake signatures match the Go implementation', () => {
  const hello = protocol.reverseHelloSign('probe-token', 'nonce-1', 1791600000);
  assert.equal(hello, 'yJdwtZXgQdpvkTsthshvX_5GdcM2kWrbSUM0vtAuj3ZrgGZi-AXvDvdYdFGVcPzw0HnV9E1ifgkCxJus_vvJAw==');
  assert.equal(protocol.hashMiaoSpeed('probe-token', hello),
    '8QAfeVrEQ9bIir3vG1lNJ3J9zTOkiFfP5r3KzaKY9qzrMvMY_-9QlNCne78MYpsRdgZAUARtTD-WiPeLGcOAxQ==');
  // Empty token segments are replaced, exactly like the Go code does.
  assert.equal(protocol.hashMiaoSpeed('', 'x'),
    'az51p41pN7E7WKJDf4psFTVpfPiZX1U7MdeoXCqjiLrzQl3qaKvmI5r-MyNA52AgMTQCcOjCoWSfBUu1mSn2Jg==');
});

test('Go string escaping covers HTML, control characters, line separators and lone surrogates', () => {
  assert.equal(protocol.goJSON('<a&b>'), '"\\u003ca\\u0026b\\u003e"');
  assert.equal(protocol.goJSON('\n\r\t\b\f\u0001\u007f'), '"\\n\\r\\t\\u0008\\u000c\\u0001\u007f"');
  assert.equal(protocol.goJSON('a b '), '"a\\u2028b\\u2029"');
  assert.equal(protocol.goJSON('x\ud800y'), '"x�y"');
  assert.equal(protocol.goJSON({ b: [1, true, null], a: '中' }), '{"b":[1,true,null],"a":"中"}');
  assert.throws(() => protocol.goJSON(1.5), /non-integer/);
});

test('configs are always complete and clamped to what miaospeed accepts', () => {
  const { Configs } = protocol.buildRequest({ id: 'x', matrices: [], nodes: [], configs: { downloadDuration: 99, pingAverageOver: 0 } });
  assert.equal(Configs.DownloadDuration, protocol.DEFAULT_CONFIGS.downloadDuration);
  assert.equal(Configs.PingAverageOver, 1);
  assert.equal(Configs.PingAddress, protocol.DEFAULT_CONFIGS.pingAddress);
  assert.equal(Configs.DownloadURL, 'DYNAMIC:INTL');
  assert.equal(Configs.ApiVersion, 3);
  assert.deepEqual(Configs.DNSServers, []);
});

test('reverse hellos are checked for protocol, clock skew and signature', () => {
  const now = 1791600000 * 1000;
  const hello = { Type: 'hello', Protocol: 'msr-v1', Nonce: 'nonce-1', Timestamp: 1791600000,
    Sign: protocol.reverseHelloSign('probe-token', 'nonce-1', 1791600000) };
  assert.equal(protocol.checkReverseHello(hello, 'probe-token', { now }), null);
  assert.match(protocol.checkReverseHello(hello, 'other-token', { now }), /signature/);
  assert.match(protocol.checkReverseHello({ ...hello, Protocol: 'msr-v9' }, 'probe-token', { now }), /protocol/);
  assert.match(protocol.checkReverseHello(hello, 'probe-token', { now: now + 3600 * 1000 }), /skew/);
  const ack = protocol.buildReverseAck(hello, 'probe-token', { sessionId: 's1' });
  assert.equal(ack.Sign, protocol.hashMiaoSpeed('probe-token', hello.Sign));
  assert.equal(ack.Type, 'ack');
});

test('result slots decode into flat values; zero latency means failure', () => {
  const slot = {
    ProxyInfo: { Name: 'n1', Address: '1.2.3.4:443', Type: 'Vless' }, InvokeDuration: 1200,
    Matrices: [
      { Type: 'TEST_PING_RTT', Payload: '{"Value":42}' },
      { Type: 'TEST_PING_CONN', Payload: '{"Value":0}' },
      { Type: 'UDP_TYPE', Payload: '{"Value":"FullCone"}' },
      { Type: 'SPEED_PER_SECOND', Payload: '{"Max":3,"Average":2,"Speeds":[1,3,2]}' },
      { Type: 'GEOIP_OUTBOUND', Payload: JSON.stringify({ IPv4Stack: [{ ip: '9.9.9.9', country_code: 'jp', asn: 1, asn_organization: 'Org' }], IPv6Stack: [] }) },
      { Type: 'TEST_SCRIPT', Payload: '{"Key":"netflix","Text":"解锁(jp)","Background":"186,230,126","TimeElapsed":900}' }
    ]
  };
  const result = protocol.decodeSlot(slot);
  assert.equal(result.rtt, 42);
  assert.equal(result.http, 0);
  assert.equal(result.udpType, 'FullCone');
  assert.deepEqual(result.speeds, [1, 3, 2]);
  assert.equal(result.outbound.main.countryCode, 'JP');
  assert.equal(result.outbound.stack, '4');
  assert.equal(result.scripts.netflix.text, '解锁(jp)');
});
