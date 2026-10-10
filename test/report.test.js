require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const reportService = require('../src/services/report');
const scripts = require('../src/miaospeed/scripts');

test('renders the node matrix with script columns, regional services and offline rows', async () => {
  const png = await reportService.render([
    {
      node: { name: '🇯🇵 东京节点', subscription: '测试订阅', protocol: 'vless', region: 'JP' },
      online: true, responseTime: 188, rtt: 61,
      media: {
        exit: { region: 'JP' },
        services: {
          netflix: { status: 'unlocked', text: '解锁(jp)', region: 'JP' },
          chatgpt: { status: 'blocked', text: '失败(JP)' },
          abema: { status: 'unlocked', text: '解锁', label: 'Abema', regional: true }
        }
      }
    },
    { node: { name: 'HK <&>', protocol: 'ss', region: 'HK' }, online: false, responseTime: null }
  ], { columns: ['netflix', 'chatgpt'], probeName: '家里' });
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.ok(meta.width > 900);
});

test('an empty probe still renders', async () => {
  const png = await reportService.render([]);
  assert.deepEqual([...png.subarray(0, 4)], [137, 80, 78, 71]);
});

test('script results are classified by the colour the script reports', () => {
  assert.deepEqual(scripts.classify({ text: '解锁(hk)', background: '186,230,126' }), { status: 'unlocked', region: 'HK', text: '解锁(hk)' });
  assert.equal(scripts.classify({ text: '失败(HK)', background: '239,107,115' }).status, 'blocked');
  assert.equal(scripts.classify({ text: '仅自制', background: '253,109,20' }).status, 'limited');
  assert.equal(scripts.classify({ text: 'N/A', background: '142,140,142' }).status, 'na');
  assert.equal(scripts.classify({ text: '解锁(ALISG)', background: '186,230,126' }).region, null);
  assert.equal(scripts.classify({ text: '解锁', background: '' }).status, 'unlocked');
  assert.equal(scripts.classify(null).status, 'error');
});

test('the vendored script catalogue resolves default columns and regional extras', () => {
  for (const id of scripts.DEFAULT_SCRIPTS) assert.ok(scripts.meta(id), id);
  const request = scripts.forRequest(['netflix', 'nope']);
  assert.equal(request.length, 1);
  assert.match(request[0].content, /function handler/);
  const hk = scripts.regional('HK', ['netflix']);
  assert.ok(hk.length > 0 && hk.length <= 4);
  assert.ok(hk.every(id => scripts.meta(id).regions.includes('hk')));
  assert.deepEqual(scripts.regional(null), []);
});
