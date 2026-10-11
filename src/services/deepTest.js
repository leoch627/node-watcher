// "Deep tests" run on a miaospeed backend: latency/UDP, download / upload speed and topology (GeoIP
// of the entry and exit). One job at a time; finished jobs are kept as JSON in data/deep-tests.
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const backends = require('../miaospeed/backends');
const { runForNodes } = require('../miaospeed/tasks');
const { MATRIX } = require('../miaospeed/protocol');
const scripts = require('../miaospeed/scripts');

const HISTORY_LIMIT = 30;

const PRESETS = {
  latency: { label: '延迟测试', matrices: [MATRIX.RTT, MATRIX.HTTP, MATRIX.UDP] },
  // Latency and UDP ride along with the first speed pass (see SPEED_MODES).
  speed: { label: '测速', matrices: [MATRIX.RTT, MATRIX.HTTP, MATRIX.UDP] },
  topology: { label: '拓扑分析', matrices: [MATRIX.GEO_IN, MATRIX.GEO_OUT] },
  // Plus one TEST_SCRIPT matrix per selected miaospeed-scripts check.
  unlock: { label: '解锁测试', matrices: [MATRIX.RTT, MATRIX.HTTP, MATRIX.GEO_OUT] }
};

const DOWNLOAD_URLS = {
  auto: 'DYNAMIC:INTL',
  fast: 'DYNAMIC:FAST',
  cloudflare: 'https://speed.cloudflare.com/__down?bytes=1000000000',
  cachefly: 'http://cachefly.cachefly.net/200mb.test'
};

const UPLOAD_URLS = {
  auto: 'DYNAMIC:INTL',
  cloudflare: 'https://speed.cloudflare.com/__up'
};

// A speed test is one or more passes. miaospeed runs every macro of a request concurrently and
// takes one thread count per direction, so each direction / thread count is its own task.
const SPEED_MODES = {
  'download-single': { direction: 'download', multi: false, label: '单线程下载' },
  'download-multi': { direction: 'download', multi: true, label: '多线程下载' },
  'upload-single': { direction: 'upload', multi: false, label: '单线程上传' },
  'upload-multi': { direction: 'upload', multi: true, label: '多线程上传' }
};

const SPEED_MATRICES = {
  download: [MATRIX.SPEED_AVG, MATRIX.SPEED_MAX, MATRIX.SPEED_SERIES],
  upload: [MATRIX.USPEED_AVG, MATRIX.USPEED_MAX, MATRIX.USPEED_SERIES]
};

// The passes of a speed job, also for jobs saved before passes existed (download only, results in
// avgSpeed / maxSpeed / speeds).
function speedPasses(job) {
  if (job.preset !== 'speed') return [];
  if (Array.isArray(job.options?.passes)) return job.options.passes;
  const threads = job.options?.downloadThreading || 1;
  return [{ key: `download-${threads}`, direction: 'download', threads, label: threads > 1 ? `${threads}线程下载` : '单线程下载', legacy: true }];
}

// { avg, max, speeds } of one pass for one node result, or null when it has none.
function passResult(result, pass) {
  if (!result) return null;
  if (pass.legacy) return result.avgSpeed == null && !result.speeds ? null : { avg: result.avgSpeed ?? null, max: result.maxSpeed ?? null, speeds: result.speeds || [] };
  return result.speed?.[pass.key] || null;
}

const intIn = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

function matcher(pattern) {
  const text = String(pattern || '').trim();
  if (!text) return null;
  try {
    const regex = new RegExp(text, 'i');
    return value => regex.test(value);
  } catch (_) {
    const needle = text.toLowerCase();
    return value => value.toLowerCase().includes(needle);
  }
}

function selectNodes(nodes, { nodeIds, sourceId, include, exclude } = {}) {
  const ids = Array.isArray(nodeIds) && nodeIds.length ? new Set(nodeIds.map(String)) : null;
  const keep = matcher(include);
  const drop = matcher(exclude);
  return nodes.filter(node => node.proxy
    && (!ids || ids.has(node.id))
    && (!sourceId || node.source?.id === sourceId)
    && (!keep || keep(node.name))
    && (!drop || !drop(node.name)));
}

function nodeSnapshot(node) {
  return {
    id: node.id, name: node.name, protocol: node.protocol || node.proxy?.type || '',
    source: node.source?.name || node.subscription || '', region: node.region || null
  };
}

function compactResult(result) {
  const { name, address, type, scripts, ...rest } = result;
  return Object.keys(scripts || {}).length ? { ...rest, scripts } : rest;
}

// Events: 'progress' (job) after each node result, 'done' (job) when a job ends in any state.
class DeepTestService extends EventEmitter {
  constructor({ dataDir, getNodes, manager = backends, unlockScripts } = {}) {
    super();
    this.unlockScripts = unlockScripts || (() => require('./scheduler').unlockSettings().scripts);
    this.dir = path.join(dataDir || path.join(process.cwd(), 'data'), 'deep-tests');
    this.getNodes = getNodes || (() => require('./scheduler').nodes);
    this.manager = manager;
    this.current = null;
    this.controller = null;
    this.index = null;
  }

  // --- history ---------------------------------------------------------------------------------

  loadIndex() {
    if (this.index) return this.index;
    this.index = [];
    try {
      for (const file of fs.readdirSync(this.dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          this.index.push(this.summary(JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8'))));
        } catch (error) {
          logger.warn(`Ignoring unreadable deep test ${file}: ${error.message}`);
        }
      }
    } catch (_) { /* no history yet */ }
    this.index.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    return this.index;
  }

  summary(job) {
    const { results, nodes, ...rest } = job;
    return { ...rest, nodeCount: nodes?.length || 0 };
  }

  persist(job) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, `${job.id}.json`), JSON.stringify(job));
      const index = this.loadIndex();
      index.unshift(this.summary(job));
      for (const old of index.splice(HISTORY_LIMIT)) {
        fs.rmSync(path.join(this.dir, `${old.id}.json`), { force: true });
      }
    } catch (error) {
      logger.error(`Could not save deep test ${job.id}: ${error.message}`);
    }
  }

  list() {
    return this.loadIndex();
  }

  get(id) {
    if (this.current?.id === id) return this.current;
    if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, `${id}.json`), 'utf8'));
    } catch (_) {
      return null;
    }
  }

  remove(id) {
    if (this.current?.id === id) return false;
    const index = this.loadIndex();
    const position = index.findIndex(item => item.id === id);
    if (position < 0) return false;
    index.splice(position, 1);
    fs.rmSync(path.join(this.dir, `${id}.json`), { force: true });
    return true;
  }

  // --- running ---------------------------------------------------------------------------------

  options(preset, input = {}) {
    const options = { pingAverageOver: intIn(input.pingAverageOver, 1, 16, 3), taskRetry: intIn(input.taskRetry, 1, 10, 3) };
    if (preset === 'unlock') {
      const chosen = Array.isArray(input.scripts) ? input.scripts.map(String).filter(id => scripts.meta(id)) : [];
      options.scripts = chosen.length ? [...new Set(chosen)].slice(0, 30) : this.unlockScripts();
    }
    if (preset === 'speed') {
      options.duration = intIn(input.duration ?? input.downloadDuration, 1, 30, 5);
      options.multiThreads = intIn(input.multiThreads, 2, 32, 8);
      options.downloadSource = DOWNLOAD_URLS[input.downloadSource] ? input.downloadSource : 'auto';
      options.uploadSource = UPLOAD_URLS[input.uploadSource] ? input.uploadSource : 'auto';
      let modes = Array.isArray(input.modes) ? Object.keys(SPEED_MODES).filter(key => input.modes.includes(key)) : [];
      // Older clients send a single download thread count.
      if (!modes.length) modes = [Number(input.downloadThreading) > 1 ? 'download-multi' : 'download-single'];
      if (!Array.isArray(input.modes) && Number(input.downloadThreading) > 1) options.multiThreads = intIn(input.downloadThreading, 2, 32, 8);
      options.passes = modes.map(mode => {
        const { direction, multi } = SPEED_MODES[mode];
        const threads = multi ? options.multiThreads : 1;
        return { key: `${direction}-${threads}`, mode, direction, threads, label: multi ? `${threads}线程${direction === 'download' ? '下载' : '上传'}` : SPEED_MODES[mode].label };
      });
    }
    return options;
  }

  // nodes: explicit runtime nodes (e.g. a temporary subscription from the Telegram bot) instead of
  // the saved node list. requestedBy: who asked ({ source, userId, chatId, username }), kept on the job.
  start({ preset, backendId, nodes, nodeIds, sourceId, include, exclude, options: input, requestedBy } = {}) {
    if (this.current?.status === 'running') throw Object.assign(new Error('已有深度测试正在运行'), { status: 409 });
    if (!PRESETS[preset]) throw Object.assign(new Error('Unknown test type'), { status: 400 });
    const backend = this.manager.get(backendId || '') || this.manager.available()[0];
    if (!backend) throw Object.assign(new Error('没有可用的 miaospeed 后端'), { status: 409 });
    if (!backend.enabled || backend.online === false) throw Object.assign(new Error(`后端 ${backend.name} 不可用`), { status: 409 });
    const pool = Array.isArray(nodes) ? nodes : (this.getNodes() || []);
    const selected = selectNodes(pool, { nodeIds, sourceId: Array.isArray(nodes) ? null : sourceId, include, exclude });
    if (selected.length === 0) throw Object.assign(new Error('没有符合条件的节点'), { status: 400 });
    const options = this.options(preset, input);
    const job = {
      id: crypto.randomUUID(), preset, label: PRESETS[preset].label, status: 'running',
      backend: { id: backend.id, name: backend.name, type: backend.type }, version: null,
      filter: { sourceId: sourceId || null, include: include || '', exclude: exclude || '' }, options,
      total: selected.length * Math.max(1, options.passes?.length || 0), completed: 0, current: null, queuing: null,
      stage: null, warnings: [],
      startedAt: new Date().toISOString(), finishedAt: null, durationMs: null, error: null,
      nodes: selected.map(nodeSnapshot), results: {},
      temporary: Array.isArray(nodes), requestedBy: requestedBy || null
    };
    this.current = job;
    this.controller = new AbortController();
    this.execute(job, selected, this.controller.signal).catch(error => logger.error(`Deep test crashed: ${error.message}`));
    return job;
  }

  timeoutFor(preset, count, options) {
    if (preset === 'speed') return count * ((options.duration + 20) * 1000) + 120000;
    if (preset === 'unlock') return Math.max(240000, count * 30000);
    return Math.max(180000, count * 8000);
  }

  async execute(job, nodes, signal) {
    const started = Date.now();
    const names = new Map(nodes.map(node => [node.id, node.name]));
    try {
      if (job.preset === 'speed') await this.executeSpeed(job, nodes, signal, names);
      else await this.executeOnce(job, nodes, signal, names);
      job.status = 'completed';
    } catch (error) {
      job.status = error.aborted && signal.aborted ? 'cancelled' : 'failed';
      job.error = job.status === 'cancelled' ? null : error.message;
      if (job.status === 'failed') logger.warn(`Deep test ${job.id} failed: ${error.message}`);
    } finally {
      job.current = null;
      job.stage = null;
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - started;
      if (job.preset === 'speed') {
        job.trafficBytes = Object.values(job.results).reduce((sum, item) => sum
          + Object.values(item.speed || {}).reduce((total, run) => total + (run.speeds || []).reduce((a, b) => a + b, 0), 0), 0);
      }
      this.controller = null;
      if (job.completed > 0 || job.status === 'completed') this.persist(job);
      this.emit('done', job);
    }
  }

  async executeOnce(job, nodes, signal, names) {
    const configs = {
      pingAverageOver: job.options.pingAverageOver, taskRetry: job.options.taskRetry,
      ...(job.preset === 'unlock' ? { taskTimeout: 10000 } : {})
    };
    const unlockIds = job.preset === 'unlock' ? job.options.scripts : [];
    const matrices = [...PRESETS[job.preset].matrices, ...unlockIds.map(id => ({ type: MATRIX.SCRIPT, params: id }))];
    const outcome = await runForNodes(job.backend.id, nodes, {
      matrices, scripts: scripts.forRequest(unlockIds), configs, signal, manager: this.manager,
      timeoutMs: this.timeoutFor(job.preset, nodes.length, job.options),
      onResult: (nodeId, result) => {
        job.results[nodeId] = compactResult(result);
        job.completed = Object.keys(job.results).length;
        job.current = names.get(nodeId) || null;
        this.emit('progress', job);
      }
    });
    job.version = outcome.version || null;
  }

  // One task per pass, one after another. A failed pass is
  // recorded as a warning and the next one still runs; the job fails only when every pass failed.
  async executeSpeed(job, nodes, signal, names) {
    const passes = job.options.passes;
    let succeeded = 0;
    let lastError = null;
    for (const [index, pass] of passes.entries()) {
      job.stage = { index: index + 1, count: passes.length, label: pass.label };
      const upload = pass.direction === 'upload';
      const configs = {
        pingAverageOver: job.options.pingAverageOver, taskRetry: job.options.taskRetry,
        ...(upload
          ? { uploadDuration: job.options.duration, uploadThreading: pass.threads, uploadUrl: UPLOAD_URLS[job.options.uploadSource] }
          : { downloadDuration: job.options.duration, downloadThreading: pass.threads, downloadUrl: DOWNLOAD_URLS[job.options.downloadSource] })
      };
      // Latency / UDP ride along until a pass succeeds (normally just the first one).
      const withBase = succeeded === 0;
      const matrices = [...(withBase ? PRESETS.speed.matrices : []), ...SPEED_MATRICES[pass.direction]];
      const done = new Set();
      try {
        const outcome = await runForNodes(job.backend.id, nodes, {
          matrices, configs, signal, manager: this.manager,
          timeoutMs: this.timeoutFor('speed', nodes.length, job.options),
          onResult: (nodeId, raw) => {
            const { avgSpeed, maxSpeed, speeds, uploadAvgSpeed, uploadMaxSpeed, uploadSpeeds, ...rest } = compactResult(raw);
            const target = job.results[nodeId] || (job.results[nodeId] = {});
            if (withBase) Object.assign(target, rest);
            target.speed = { ...target.speed, [pass.key]: upload
              ? { avg: uploadAvgSpeed ?? null, max: uploadMaxSpeed ?? null, speeds: uploadSpeeds || [] }
              : { avg: avgSpeed ?? null, max: maxSpeed ?? null, speeds: speeds || [] } };
            done.add(nodeId);
            job.completed += 1;
            job.current = names.get(nodeId) || null;
            this.emit('progress', job);
          }
        });
        job.version = outcome.version || job.version;
        succeeded += 1;
        // A backend without -upload accepts the task and reports zeros for every node, also for nodes
        // that answered the latency test; unreachable nodes alone say nothing.
        const reachable = [...done].filter(id => job.results[id].http > 0);
        if (upload && reachable.length && reachable.every(id => !job.results[id].speed[pass.key].avg)) {
          job.warnings.push(`${pass.label}：全部为 0，后端可能没有以 -upload 启动（miaospeed 默认不开放上传测速）`);
        }
      } catch (error) {
        if (error.aborted && signal.aborted) throw error;
        lastError = error;
        job.warnings.push(`${pass.label}：${error.message}`);
        logger.warn(`Deep test ${job.id} pass ${pass.label} failed: ${error.message}`);
        // Keep the progress bar honest: the nodes of a failed pass count as done.
        job.completed += nodes.length - done.size;
      }
    }
    if (!succeeded) throw lastError || new Error('测速失败');
  }

  cancel(id) {
    if (this.current?.id !== id || this.current.status !== 'running') return false;
    this.controller?.abort();
    return true;
  }
}

const service = new DeepTestService({ dataDir: path.dirname(require('./monitor').historyPath) });
module.exports = service;
module.exports.DeepTestService = DeepTestService;
module.exports.PRESETS = PRESETS;
module.exports.DOWNLOAD_URLS = DOWNLOAD_URLS;
module.exports.UPLOAD_URLS = UPLOAD_URLS;
module.exports.SPEED_MODES = SPEED_MODES;
module.exports.speedPasses = speedPasses;
module.exports.passResult = passResult;
module.exports.selectNodes = selectNodes;
