const test = require('node:test');
const assert = require('node:assert/strict');
const regional = require('../src/services/regionalMedia');

const json = (status, body) => ({ status, data: JSON.stringify(body) });

test('maps regions to the services worth checking there', () => {
  assert.deepEqual(regional.servicesFor('jp'), ['abema']);
  assert.deepEqual(regional.servicesFor('TW'), ['bahamut', 'kktv', 'bilibiliHmt']);
  assert.deepEqual(regional.servicesFor('US'), []);
  assert.deepEqual(regional.servicesFor(null), []);
});

test('classifies Abema responses', () => {
  assert.equal(regional.classifyAbema(json(403, { message: 'anonymous_ip' })).detail, 'Anonymous / datacenter IP');
  assert.equal(regional.classifyAbema(json(200, { isoCountryCode: 'JP' })).status, 'unlocked');
  assert.equal(regional.classifyAbema(json(200, { isoCountryCode: 'US' })).status, 'blocked');
  assert.equal(regional.classifyAbema(json(500, {})).status, 'error');
});

test('classifies KKTV, Bilibili and Viu TV responses', () => {
  assert.equal(regional.classifyKktv(json(200, { data: { country: 'TW', is_allowed: true } })).status, 'unlocked');
  assert.equal(regional.classifyKktv(json(200, { data: { country: 'TW', ip: '1.2.3.4', is_allowed: true } })).platformIp, '1.2.3.4');
  const denied = regional.classifyKktv(json(200, { data: { country: 'US', is_allowed: false } }));
  assert.equal(denied.status, 'blocked');
  assert.equal(denied.region, 'US');
  assert.equal(regional.classifyKktv(json(200, {})).status, 'error');
  assert.equal(regional.classifyBilibiliHmt(json(200, { code: 0 })).status, 'unlocked');
  assert.equal(regional.classifyBilibiliHmt(json(200, { code: -10403 })).status, 'blocked');
  assert.equal(regional.classifyBilibiliHmt(json(200, { code: -412 })).status, 'error');
  assert.equal(regional.classifyViuTv(json(200, { responseCode: 'GEO_CHECK_FAIL' })).status, 'blocked');
  assert.equal(regional.classifyViuTv(json(200, { responseCode: 'SUCCESS' })).status, 'unlocked');
});

test('Bahamut reports anti-bot responses as errors instead of guessing "blocked"', () => {
  assert.equal(regional.classifyBahamut({ status: 403, data: '<html>' }, null).status, 'error');
  const device = json(200, { deviceid: 'abc' });
  assert.equal(regional.classifyBahamut(device, { status: 200, data: '{"animeSn":14667}' }).status, 'unlocked');
  assert.equal(regional.classifyBahamut(device, { status: 200, data: '{"error":{"code":1007}}' }).status, 'blocked');
  assert.equal(regional.classifyBahamut(device, { status: 403, data: '' }).status, 'error');
});

test('checks every service for the region and labels the results', async () => {
  const client = {
    get: async url => {
      if (url.includes('kktv')) return json(200, { data: { country: 'TW', is_allowed: true } });
      if (url.includes('bilibili')) return json(200, { code: -10403 });
      if (url.includes('getdeviceid')) return { status: 403, data: '<html>' };
      throw new Error(`unexpected ${url}`);
    }
  };
  const outcome = await regional.checkRegion(client, 'tw');
  assert.equal(outcome.region, 'TW');
  assert.equal(outcome.services.kktv.status, 'unlocked');
  assert.equal(outcome.services.kktv.label, 'KKTV');
  assert.equal(outcome.services.bilibiliHmt.status, 'blocked');
  assert.equal(outcome.services.bahamut.status, 'error');
});

test('a failing request becomes an error result, and regions without checks return null', async () => {
  const client = { get: async () => { throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); } };
  const outcome = await regional.checkRegion(client, 'JP');
  assert.equal(outcome.services.abema.status, 'error');
  assert.match(outcome.services.abema.detail, /socket hang up/);
  assert.equal(await regional.checkRegion(client, 'US'), null);
});
