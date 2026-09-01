const test = require('node:test');
const assert = require('node:assert/strict');
const reportService = require('../src/services/report');
const { parseTrace } = require('../src/services/media');

test('parses Cloudflare trace output', () => {
  assert.deepEqual(parseTrace('ip=203.0.113.1\nloc=JP\n'), { ip: '203.0.113.1', loc: 'JP' });
});

test('renders a valid PNG report', async () => {
  const png = await reportService.render([{
    node: { name: '东京节点', subscription: '测试订阅', protocol: 'vless' },
    online: true,
    responseTime: 88,
    media: { services: { netflix: { status: 'unlocked', region: 'JP', detail: 'Full catalog' } } }
  }]);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.length > 1000);
});
