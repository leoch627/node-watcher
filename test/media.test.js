const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyChatGPT,
  extractRegion,
  netflixUnavailable
} = require('../src/services/media');

test('extracts service regions using RegionRestrictionCheck page signals', () => {
  assert.equal(extractRegion('{"INNERTUBE_CONTEXT_GL":"JP"}'), 'JP');
  assert.equal(extractRegion('{"currentTerritory":"DE"}'), 'DE');
  assert.equal(extractRegion('{"id":"US","countryName":"United States"}'), 'US');
  assert.equal(extractRegion('unclassified', 'SG'), 'SG');
});

test('classifies Netflix title failures', () => {
  assert.equal(netflixUnavailable({ status: 200, data: '<h1>Oh no!</h1>' }), true);
  assert.equal(netflixUnavailable({ status: 404, data: '' }), true);
  assert.equal(netflixUnavailable({ status: 200, data: '<title>Watch now</title>' }), false);
});

test('classifies ChatGPT web and app availability independently', () => {
  const available = { status: 200, data: '{}' };
  const webBlocked = { status: 200, data: '{"unsupported_country":true}' };
  const appBlocked = { status: 200, data: 'VPN access denied' };

  assert.equal(classifyChatGPT(available, available, 'JP').status, 'unlocked');
  assert.equal(classifyChatGPT(available, appBlocked, 'JP').detail, 'Web browser only');
  assert.equal(classifyChatGPT(webBlocked, available, 'JP').detail, 'Mobile app only');
  assert.equal(classifyChatGPT(webBlocked, appBlocked, 'JP').status, 'blocked');
});

const { classifyNetflix, classifyTikTok, classifyHbo, SERVICE_KEYS } = require('../src/services/media');

test('Netflix: both titles rejected with 403 means the IP is blocked, not "originals only"', () => {
  const forbidden = { status: 403, data: '' };
  const missing = { status: 200, data: '<h1>Oh no!</h1>' };
  const available = { status: 200, data: '{"currentTerritory":"JP"}' };
  assert.equal(classifyNetflix(forbidden, forbidden, 'US').status, 'blocked');
  assert.equal(classifyNetflix(missing, missing, 'US').status, 'limited');
  assert.equal(classifyNetflix(available, missing, 'US').status, 'unlocked');
  assert.equal(classifyNetflix(available, missing, 'US').region, 'JP');
});

test('TikTok: region marker in the page decides the result', () => {
  assert.deepEqual(classifyTikTok({ status: 200, data: '{"region":"JP"}' }), { status: 'unlocked', detail: 'Available', region: 'JP' });
  assert.equal(classifyTikTok({ status: 200, data: '<html>no region</html>' }).status, 'limited');
  assert.equal(classifyTikTok({ status: 403, data: 'denied' }).status, 'blocked');
  assert.equal(classifyTikTok({ status: 200, data: '' }).status, 'error');
});

test('HBO Max: geo-availability redirect means blocked, otherwise the first path segment is the region', () => {
  assert.equal(classifyHbo('https://www.max.com/geo-availability', 200).status, 'blocked');
  const ok = classifyHbo('https://www.max.com/us/en', 200, 'JP');
  assert.equal(ok.status, 'unlocked');
  assert.equal(ok.region, 'US');
  assert.equal(classifyHbo(null, 200).status, 'error');
});

test('media results cover every global service key', () => {
  assert.deepEqual(SERVICE_KEYS, ['netflix', 'youtube', 'disney', 'primeVideo', 'chatgpt', 'tiktok', 'hbo']);
});

const { extractPlatformIp, classifyUnlock, annotateUnlock } = require('../src/services/media');

test('extracts the client IP each platform echoes back (formats observed live)', () => {
  assert.equal(extractPlatformIp('"INNERTUBE_CONTEXT":{"client":{"hl":"en","gl":"SG","remoteHost":"43.252.21.50","deviceMake":""'), '43.252.21.50');
  assert.equal(extractPlatformIp('&#34;marketplaceID&#34;:&#34;A15PK738MTQHSO&#34;,&#34;customerIPAddress&#34;:&#34;43.252.21.50&#34;,'), '43.252.21.50');
  assert.equal(extractPlatformIp('"customerIPAddress":"2001:db8::7","originalURI"'), '2001:db8::7');
  assert.equal(extractPlatformIp('"requestIpAddress":"43.252.21.50,2600:1f14:62a:de08::9045","condu'), '43.252.21.50');
  assert.equal(extractPlatformIp('"remoteHost":"not-an-ip"'), null);
  assert.equal(extractPlatformIp(''), null);
});

test('same IP as the node exit is native, a different IP is a DNS / split-routing unlock', () => {
  assert.equal(classifyUnlock('1.1.1.1', ['1.1.1.1', '1.1.1.1']).unlockType, 'native');
  const dns = classifyUnlock('2.2.2.2', ['1.1.1.1', '1.1.1.1']);
  assert.equal(dns.unlockType, 'dns');
  assert.match(dns.unlockNote, /2\.2\.2\.2/);
  assert.equal(classifyUnlock('2.2.2.2', ['1.1.1.1', null]).unlockType, 'dns');
});

test('no verdict when the exit IP is unknown, rotates, or the address families differ', () => {
  assert.equal(classifyUnlock('2.2.2.2', [null, undefined]), null);
  assert.equal(classifyUnlock(null, ['1.1.1.1']), null);
  const rotating = classifyUnlock('2.2.2.2', ['1.1.1.1', '3.3.3.3']);
  assert.equal(rotating.unlockType, null);
  assert.match(rotating.unlockNote, /不固定/);
  assert.equal(classifyUnlock('2001:db8::1', ['1.1.1.1']).unlockType, null);
});

test('only reachable services get an unlock type, and the raw platformIp key is consumed', () => {
  const exits = ['1.1.1.1', '1.1.1.1'];
  const unlocked = annotateUnlock({ status: 'unlocked', detail: 'ok', region: 'JP', platformIp: '1.1.1.1' }, exits);
  assert.equal(unlocked.unlockType, 'native');
  const limited = annotateUnlock({ status: 'limited', detail: 'Originals only', region: 'JP', platformIp: '9.9.9.9' }, exits);
  assert.equal(limited.unlockType, 'dns');
  const blocked = annotateUnlock({ status: 'blocked', detail: 'no', region: null, platformIp: '9.9.9.9' }, exits);
  assert.deepEqual(blocked, { status: 'blocked', detail: 'no', region: null });
  const noEcho = { status: 'unlocked', detail: 'ok', region: 'US' };
  assert.equal(annotateUnlock(noEcho, exits), noEcho);
  assert.equal(annotateUnlock(null, exits), null);
});
