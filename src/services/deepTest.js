// "Deep tests" run on a miaospeed backend: latency/UDP, download speed and topology (GeoIP of the
// entry and exit). One job at a time; finished jobs are kept as JSON in data/deep-tests.
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
  speed: { label: '测速', matrices: [MATRIX.RTT, MATRIX.HTTP, MATRIX.SPEED_AVG, MATRIX.SPEED_MAX, MATRIX.SPEED_SERIES, MATRIX.UDP] },
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
      options.downloadDuration = intIn(input.downloadDuration, 1, 30, 5);
      options.downloadThreading = intIn(input.downloadThreading, 1, 32, 1);
      options.downloadSource = DOWNLOAD_URLS[input.downloadSource] ? input.downloadSource : 'auto';
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
      total: selected.length, completed: 0, current: null, queuing: null,
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
    if (preset === 'speed') return count * ((options.downloadDuration + 20) * 1000) + 120000;
    if (preset === 'unlock') return Math.max(240000, count * 30000);
    return Math.max(180000, count * 8000);
  }

  async execute(job, nodes, signal) {
    const started = Date.now();
    const configs = {
      pingAverageOver: job.options.pingAverageOver, taskRetry: job.options.taskRetry,
      ...(job.preset === 'speed' ? {
        downloadDuration: job.options.downloadDuration, downloadThreading: job.options.downloadThreading,
        downloadUrl: DOWNLOAD_URLS[job.options.downloadSource]
      } : {}),
      ...(job.preset === 'unlock' ? { taskTimeout: 10000 } : {})
    };
    const unlockIds = job.preset === 'unlock' ? job.options.scripts : [];
    const matrices = [...PRESETS[job.preset].matrices, ...unlockIds.map(id => ({ type: MATRIX.SCRIPT, params: id }))];
    const names = new Map(nodes.map(node => [node.id, node.name]));
    try {
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
      job.status = 'completed';
    } catch (error) {
      job.status = error.aborted && signal.aborted ? 'cancelled' : 'failed';
      job.error = job.status === 'cancelled' ? null : error.message;
      if (job.status === 'failed') logger.warn(`Deep test ${job.id} failed: ${error.message}`);
    } finally {
      job.current = null;
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - started;
      if (job.preset === 'speed') {
        job.trafficBytes = Object.values(job.results).reduce((sum, item) => sum + (item.speeds || []).reduce((a, b) => a + b, 0), 0);
      }
      this.controller = null;
      if (job.completed > 0 || job.status === 'completed') this.persist(job);
      this.emit('done', job);
    }
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
module.exports.selectNodes = selectNodes;
