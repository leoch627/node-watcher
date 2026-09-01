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
