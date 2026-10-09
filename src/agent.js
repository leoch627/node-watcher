// Remote probe mode: no web UI, no subscriptions, no notifications. Connects to the master over TLS,
// loads the node list it receives into a local Mihomo core and runs the checks the master asks for.
const http = require('http');
const logger = require('./utils/logger');
const mihomoService = require('./services/mihomo');
const mediaService = require('./services/media');
const prober = require('./services/prober');
const { ProbeClient } = require('./probe/client');
const { parseJoin, DEFAULT_PORT } = require('./probe/protocol');
const { version } = require('../package.json');

function readJoinConfig(env = process.env) {
  if (env.NODE_WATCHER_JOIN) return parseJoin(env.NODE_WATCHER_JOIN);
  const [host, port] = String(env.MASTER_ADDR || '').split(/:(?=\d+$)/);
  if (!host || !env.PROBE_ID || !env.PROBE_TOKEN) {
    throw new Error('Set NODE_WATCHER_JOIN (copy it from the master: Settings → Probes), '
      + 'or MASTER_ADDR, PROBE_ID, PROBE_TOKEN and MASTER_FINGERPRINT');
  }
  return {
    host: host.replace(/^\[|\]$/g, ''), port: Number(port) || DEFAULT_PORT,
    id: env.PROBE_ID, token: env.PROBE_TOKEN, fingerprint: env.MASTER_FINGERPRINT || null
  };
}

function createHandlers() {
  let nodes = [];
  return {
    isReady: () => mihomoService.ready,
    nodes: () => nodes,
    async loadNodes(next) {
      nodes = next.filter(node => node && node.id && node.proxy && node.proxyName);
      await mihomoService.updateProxies(nodes);
      logger.info(`Loaded ${nodes.length} nodes from master`);
    },
    async check(options) {
      if (!mihomoService.ready) return { mihomoReady: false, results: [] };
      const snapshot = nodes;
      const raw = await prober.probeAll(snapshot, options);
      const lastCheck = new Date().toISOString();
      return {
        mihomoReady: mihomoService.ready,
        results: snapshot.map((node, index) => ({
          id: node.id,
          online: raw[index]?.online ?? null,
          latency: raw[index]?.latency ?? null,
          error: raw[index]?.error || null,
          skipped: Boolean(raw[index]?.skipped),
          lastCheck
        }))
      };
    },
    async media(nodeIds, emit) {
      if (!mihomoService.ready) return { errors: 0, error: 'Mihomo is not ready' };
      const wanted = new Set(nodeIds);
      const selected = nodes.filter(node => wanted.size === 0 || wanted.has(node.id));
      let cursor = 0;
      let errors = 0;
      const worker = async slot => {
        while (cursor < selected.length) {
          const node = selected[cursor];
          cursor += 1;
          try {
            emit(node.id, await mediaService.checkNode(node, slot));
          } catch (error) {
            errors += 1;
            const failed = { status: 'error', detail: error.message, region: null };
            emit(node.id, {
              checkedAt: new Date().toISOString(), exit: { ip: null, region: null },
              services: Object.fromEntries(mediaService.SERVICE_KEYS.map(key => [key, failed]))
            });
          }
        }
      };
      const slots = Math.max(1, Math.min(mihomoService.mediaSlots, selected.length));
      await Promise.all(Array.from({ length: slots }, (_, slot) => worker(slot)));
      return { errors };
    }
  };
}

function startHealthServer(client, port) {
  const server = http.createServer((req, res) => {
    const ready = mihomoService.ready && client.connected;
    if (req.url === '/api/ready') {
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: ready, mihomoReady: mihomoService.ready, connected: client.connected }));
      return;
    }
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, mode: 'agent', mihomoReady: mihomoService.ready, connected: client.connected }));
      return;
    }
    res.writeHead(404).end();
  });
  // Bound to loopback only: the probe exposes no service to the network.
  server.listen(port, '127.0.0.1');
  server.on('error', error => logger.warn(`Probe health endpoint unavailable: ${error.message}`));
  return server;
}

async function main() {
  const join = readJoinConfig();
  if (!join.fingerprint) logger.warn('No master fingerprint configured: relying on CA validation of the master certificate');
  const handlers = createHandlers();
  const client = new ProbeClient({ ...join, version, handlers });
  client.on('fatal', error => logger.error(`Master rejected this probe: ${error.message} (will keep retrying)`));

  try {
    await mihomoService.start();
  } catch (error) {
    logger.error(`Failed to start Mihomo: ${error.message} (restart scheduled)`);
  }
  client.start();
  const health = startHealthServer(client, Number(process.env.PORT) || 3000);

  let lastReady = mihomoService.ready;
  const statusTimer = setInterval(() => {
    if (mihomoService.ready !== lastReady) {
      lastReady = mihomoService.ready;
      client.reportStatus();
    }
  }, 5000);
  statusTimer.unref?.();

  logger.info(`Node Watcher probe ${join.id} → ${join.host}:${join.port}`);

  const shutdown = async signal => {
    logger.info(`${signal} received, stopping probe`);
    client.stop();
    health.close();
    await mihomoService.shutdown();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', reason => logger.error(`Unhandled promise rejection: ${reason?.stack || reason}`));
  return client;
}

module.exports = { main, readJoinConfig, createHandlers };
