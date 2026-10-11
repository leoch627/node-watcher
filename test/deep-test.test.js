require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { DeepTestService, selectNodes } = require('../src/services/deepTest');
const deepReport = require('../src/services/deepReport');
const svg = require('../src/services/render/svg');

const node = (id, name, extra = {}) => ({ id, name, protocol: 'vless', source: { id: 's1', name: 'sub' }, proxy: { name, type: 'vless' }, ...extra });

test('node selection by ids, source and include / exclude patterns', () => {
  const nodes = [node('a', '🇭🇰 Hong Kong 1'), node('b', '🇯🇵 Tokyo 1'), node('c', '剩余流量 100G'), node('d', 'no proxy', { proxy: null }),
    node('e', '🇭🇰 HK 2', { source: { id: 's2', name: 'other' } })];
  assert.deepEqual(selectNodes(nodes).map(n => n.id), ['a', 'b', 'c', 'e']);
  assert.deepEqual(selectNodes(nodes, { include: 'hong kong|hk' }).map(n => n.id), ['a', 'e']);
  assert.deepEqual(selectNodes(nodes, { exclude: '剩余' }).map(n => n.id), ['a', 'b', 'e']);
  assert.deepEqual(selectNodes(nodes, { sourceId: 's2' }).map(n => n.id), ['e']);
  assert.deepEqual(selectNodes(nodes, { nodeIds: ['b', 'd'] }).map(n => n.id), ['b']);
  // An invalid regular expression falls back to a plain substring match.
  assert.deepEqual(selectNodes(nodes, { include: 'Tokyo (' }).map(n => n.id), []);
  assert.deepEqual(selectNodes(nodes, { include: '(' }).map(n => n.id), []);
});

test('jobs run on a backend, stream results, persist and refuse to overlap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-deep-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const manager = {
    get: id => (id === 'b1' ? { id: 'b1', name: '后端', type: 'forward', enabled: true, online: true } : null),
    available: () => [],
    runTask: async (id, request, { onProgress }) => {
      const results = request.nodes.map(item => ({ name: item.name, rtt: 50, http: 150, udpType: 'FullCone', scripts: {} }));
      onProgress({ result: results[0] });
      await gate;
      return { version: '4.7.8', results };
    }
  };
  const service = new DeepTestService({ dataDir: dir, manager, getNodes: () => [node('a', 'A'), node('b', 'B')] });
  const job = service.start({ preset: 'latency', backendId: 'b1' });
  assert.equal(job.status, 'running');
  assert.throws(() => service.start({ preset: 'latency', backendId: 'b1' }), /正在运行/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(job.completed, 1);
  release();
  while (job.status === 'running') await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(job.status, 'completed');
  assert.equal(job.results.b.rtt, 50);
  assert.equal(job.version, '4.7.8');
  const reloaded = new DeepTestService({ dataDir: dir, manager, getNodes: () => [] });
  assert.equal(reloaded.list()[0].id, job.id);
  assert.equal(reloaded.get(job.id).results.a.http, 150);
  assert.equal(reloaded.get('../../etc/passwd'), null);
  assert.throws(() => service.start({ preset: 'nope', backendId: 'b1' }), /Unknown test type/);
  assert.throws(() => service.start({ preset: 'latency', backendId: 'b1', include: 'zzz' }), /没有符合条件/);
});

test('speed options are clamped and turned into passes', () => {
  const service = new DeepTestService({ dataDir: os.tmpdir(), manager: {}, getNodes: () => [] });
  const legacy = service.options('speed', { downloadDuration: 99, downloadThreading: 0, downloadSource: 'evil' });
  assert.deepEqual(legacy, {
    pingAverageOver: 3, taskRetry: 3, duration: 5, multiThreads: 8, downloadSource: 'auto', uploadSource: 'auto',
    passes: [{ key: 'download-1', mode: 'download-single', direction: 'download', threads: 1, label: '单线程下载' }]
  });
  // An old client asking for 4 download threads gets one 4-thread pass.
  assert.deepEqual(service.options('speed', { downloadThreading: 4 }).passes.map(pass => pass.key), ['download-4']);
  const options = service.options('speed', { modes: ['upload-multi', 'download-single', 'bogus', 'upload-single'], multiThreads: 64, duration: 3 });
  assert.equal(options.multiThreads, 8);
  assert.deepEqual(options.passes.map(pass => [pass.key, pass.label]), [['download-1', '单线程下载'], ['upload-1', '单线程上传'], ['upload-8', '8线程上传']]);
});

test('speed jobs run one task per pass and merge results per node', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-deep-'));
  const requests = [];
  const manager = {
    get: () => ({ id: 'b1', name: '后端', type: 'forward', enabled: true, online: true }),
    available: () => [],
    runTask: async (id, request, { onProgress }) => {
      requests.push(request);
      if (request.configs.downloadThreading === 8) throw new Error('speedtest is disabled on backend');
      const upload = request.matrices.includes('USPEED_AVERAGE');
      const results = request.nodes.map(item => (upload
        ? { name: item.name, uploadAvgSpeed: 0, uploadMaxSpeed: 0, uploadSpeeds: [0, 0], scripts: {} }
        : { name: item.name, rtt: 40, http: 120, udpType: 'FullCone', avgSpeed: 1000, maxSpeed: 2000, speeds: [1000, 1000], scripts: {} }));
      results.forEach(result => onProgress({ result }));
      return { version: '4.7.8', results };
    }
  };
  const service = new DeepTestService({ dataDir: dir, manager, getNodes: () => [node('a', 'A'), node('b', 'B')] });
  const job = service.start({ preset: 'speed', backendId: 'b1', options: { modes: ['download-single', 'download-multi', 'upload-single'], duration: 2 } });
  assert.equal(job.total, 6);
  while (job.status === 'running') await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(job.status, 'completed');
  assert.equal(job.completed, 6);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].matrices, ['TEST_PING_RTT', 'TEST_PING_CONN', 'UDP_TYPE', 'SPEED_AVERAGE', 'SPEED_MAX', 'SPEED_PER_SECOND']);
  assert.deepEqual([requests[0].configs.downloadThreading, requests[0].configs.downloadDuration], [1, 2]);
  assert.deepEqual(requests[2].matrices, ['USPEED_AVERAGE', 'USPEED_MAX', 'USPEED_PER_SECOND']);
  assert.deepEqual([requests[2].configs.uploadThreading, requests[2].configs.uploadDuration, requests[2].configs.uploadUrl], [1, 2, 'DYNAMIC:INTL']);
  assert.equal(job.results.a.rtt, 40);
  assert.deepEqual(job.results.a.speed['download-1'], { avg: 1000, max: 2000, speeds: [1000, 1000] });
  assert.equal(job.results.a.speed['download-8'], undefined);
  assert.equal(job.results.a.avgSpeed, undefined);
  assert.equal(job.trafficBytes, 4000);
  assert.equal(job.warnings.length, 2);
  assert.match(job.warnings[0], /8线程下载：speedtest is disabled/);
  assert.match(job.warnings[1], /-upload/);
  const png = await deepReport.render(job, { appVersion: 't', sort: 'speed' });
  assert.ok((await sharp(png).metadata()).width > 1000);
});

test('speed reports still render jobs saved before passes existed', async () => {
  const job = {
    preset: 'speed', backend: { name: 'b' }, status: 'completed', startedAt: new Date().toISOString(), filter: {}, completed: 1, total: 1,
    options: { pingAverageOver: 1, downloadDuration: 5, downloadThreading: 4 }, nodes: [node('a', 'A')],
    results: { a: { rtt: 1, http: 2, avgSpeed: 5e6, maxSpeed: 7e6, speeds: [5e6] } }
  };
  const { speedPasses, passResult } = require('../src/services/deepTest');
  const [pass] = speedPasses(job);
  assert.equal(pass.label, '4线程下载');
  assert.deepEqual(passResult(job.results.a, pass), { avg: 5e6, max: 7e6, speeds: [5e6] });
  assert.ok((await sharp(await deepReport.render(job, {})).metadata()).width > 500);
});

const geo = (ip, cc, asn, org) => ({ main: { ip, countryCode: cc, asn, org }, v4: [{ ip }], v6: [], stack: '4' });

test('topology groups entries by IP and clusters nodes that share an exit', () => {
  const job = {
    nodes: [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
    results: {
      a: { inbound: geo('1.1.1.1', 'HK', 1, 'In'), outbound: geo('9.9.9.9', 'JP', 2, 'Out') },
      b: { inbound: geo('1.1.1.1', 'HK', 1, 'In'), outbound: geo('8.8.8.8', 'US', 3, 'Out2') },
      c: { inbound: geo('2.2.2.2', 'SG', 4, 'In2'), outbound: geo('9.9.9.9', 'JP', 2, 'Out') },
      d: {}
    }
  };
  const topo = deepReport.buildTopology(job);
  assert.equal(topo.entries.length, 2);
  assert.equal(topo.entries[0].exits.size, 2);
  assert.equal(topo.exitCount, 2);
  assert.deepEqual(topo.clusters.map(cluster => cluster.rows.map(row => row.node.id)), [['a', 'c'], ['b'], ['d']]);
  assert.equal(deepReport.maskIp('203.0.113.7'), '203.0.*.*');
  assert.equal(deepReport.maskIp('2001:db8::1'), '2001:db8:*');
  assert.equal(deepReport.formatSpeed(125000000), '1.00Gbps');
});

test('reports render to PNG for every preset', async () => {
  const base = {
    backend: { name: '本机' }, version: '4.7.8', status: 'completed', total: 2, completed: 2, durationMs: 1000,
    startedAt: new Date().toISOString(), filter: {}, nodes: [node('a', '🇭🇰 Hong Kong <1> & "x"'), node('b', '📝区域:华北地区')]
  };
  const jobs = [
    { ...base, preset: 'latency', options: { pingAverageOver: 1 }, results: { a: { rtt: 40, http: 120, udpType: 'FullCone' }, b: { rtt: 0, http: 0 } } },
    { ...base, preset: 'speed', options: { pingAverageOver: 1, downloadThreading: 1, downloadDuration: 3 }, trafficBytes: 1e9,
      results: { a: { rtt: 40, http: 120, avgSpeed: 5e7, maxSpeed: 6e7, speeds: [4e7, 6e7, 5e7] }, b: { rtt: 0, avgSpeed: 0, maxSpeed: 0, speeds: [] } } },
    { ...base, preset: 'topology', options: {}, results: { a: { inbound: geo('1.1.1.1', 'HK', 1, 'In'), outbound: geo('9.9.9.9', 'JP', 2, 'Out & Co') } } }
  ];
  for (const job of jobs) {
    const png = await deepReport.render(job, { appVersion: 'test' });
    const meta = await sharp(png).metadata();
    assert.equal(meta.format, 'png', job.preset);
    assert.ok(meta.width > 500 && meta.height > 200, job.preset);
  }
});

test('flags come from bundled images and other emoji are stripped from text', () => {
  assert.deepEqual(svg.splitFlag('🇭🇰 Hong Kong 1'), { flag: 'HK', text: 'Hong Kong 1' });
  assert.deepEqual(svg.splitFlag('📝区域:华北地区'), { flag: null, text: '区域:华北地区' });
  assert.ok(svg.flag('jp', 0, 0, 20).startsWith('<svg x="0"'));
  assert.equal(svg.flag('XX', 0, 0, 20), '');
});

test('subscription traffic headers are parsed', () => {
  const { parseUserinfo } = require('../src/services/subscription');
  assert.deepEqual(parseUserinfo('upload=1024; download=2048; total=10737418240; expire=1893456000'),
    { upload: 1024, download: 2048, total: 10737418240, expire: 1893456000 });
  assert.deepEqual(parseUserinfo('upload=0;download=5;total=0;expire=0'), { upload: 0, download: 5, total: 0, expire: null });
  assert.equal(parseUserinfo(''), null);
  assert.equal(parseUserinfo('foo=bar'), null);
});

test('unlock jobs run script matrices on explicit nodes, emit events and render the ratio row', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-unlock-'));
  const sent = [];
  const manager = {
    get: () => ({ id: 'b1', name: '后端', type: 'local', enabled: true, online: true }), available: () => [],
    runTask: async (id, request, { onProgress }) => {
      sent.push(request);
      const results = request.nodes.map(item => ({ name: item.name, http: 150, rtt: 50,
        scripts: { netflix: { text: '解锁(US)', background: '186,230,126' }, chatgpt: { text: '失败', background: '239,107,115' } } }));
      results.forEach(result => onProgress({ result }));
      return { version: '4.7.8', results };
    }
  };
  const service = new DeepTestService({ dataDir: dir, manager, getNodes: () => [node('saved', 'Saved')], unlockScripts: () => ['netflix'] });
  const events = [];
  service.on('progress', job => events.push(['progress', job.completed]));
  const done = new Promise(resolve => service.once('done', resolve));
  const temporary = [node('t1', '🇺🇸 Temp 1'), node('t2', 'Temp 2')];
  const job = service.start({ preset: 'unlock', backendId: 'b1', nodes: temporary, options: { scripts: ['netflix', 'chatgpt', 'nope'] }, requestedBy: { source: 'telegram', userId: '1' } });
  assert.deepEqual(job.options.scripts, ['netflix', 'chatgpt']);
  assert.equal(job.temporary, true);
  assert.deepEqual(job.nodes.map(item => item.id), ['t1', 't2']);
  const finished = await done;
  assert.equal(finished.status, 'completed');
  assert.deepEqual(events.map(event => event[0]), ['progress', 'progress']);
  assert.ok(sent[0].matrices.some(matrix => matrix.type === 'TEST_SCRIPT' && matrix.params === 'chatgpt'));
  assert.equal(sent[0].scripts.length, 2);
  const png = await deepReport.render(finished, { appVersion: 'test' });
  assert.equal((await sharp(png).metadata()).format, 'png');
});
