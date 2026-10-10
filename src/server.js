require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./utils/logger');
const config = require('./utils/config');
const schedulerService = require('./services/scheduler');
const mihomoService = require('./services/mihomo');
const authService = require('./services/auth');
const registry = require('./probe/registry');
const { ProbeHub } = require('./probe/hub');
const { loadOrCreateCertificate } = require('./probe/certificate');

// Import routes
const subscriptionsRouter = require('./routes/subscriptions');
const nodesRouter = require('./routes/nodes');
const notificationsRouter = require('./routes/notifications');
const systemRouter = require('./routes/system');
const manualNodesRouter = require('./routes/manualNodes');
const importsRouter = require('./routes/imports');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const probesRouter = require('./routes/probes');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

// Security headers (the dashboard is meant to be reachable from the internet).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Middleware
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}
app.use(bodyParser.json({ limit: '4mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '4mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Public API routes
// Liveness: the web server is up. `status` reads "degraded" while the Mihomo core is not ready.
// Without a local probe the master does not need Mihomo at all.
const coreReady = () => !registry.localEnabled || mihomoService.ready;
app.get('/api/health', (req, res) => {
  const mihomoReady = coreReady();
  res.json({
    success: true,
    status: mihomoReady ? 'ok' : 'degraded',
    message: mihomoReady ? 'Node Watcher is running' : 'Node Watcher is running, but the Mihomo core is not ready',
    version: '2.0.0',
    mihomoReady
  });
});
// Readiness: 503 while monitoring is impossible, so container health checks reflect the real state.
app.get('/api/ready', (req, res) => {
  const mihomoReady = coreReady();
  res.status(mihomoReady ? 200 : 503).json({ success: mihomoReady, mihomoReady });
});
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api', authService.requireAuth());
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/system', systemRouter);
app.use('/api/manual-nodes', manualNodesRouter);
app.use('/api/imports', importsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/probes', probesRouter);

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

let hub = null;

// Start server
const PORT = Number(process.env.PORT) || config.getConfig().server.port || 3000;

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

app.listen(PORT, async () => {
  logger.info(`Node Watcher server started on port ${PORT}`);
  logger.info('🚀 Node Watcher is running!');
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔌 API: http://localhost:${PORT}/api`);
  logger.info(`📈 Public Stats: http://localhost:${PORT}/api/nodes/public`);

  // Start Mihomo Core (only needed when this host is itself a probe)
  if (registry.localEnabled) {
    try {
      await mihomoService.start();
    } catch (e) {
      logger.error(`Failed to start Mihomo service: ${e.message}`);
    }
  } else {
    logger.info('Local probe disabled (LOCAL_PROBE=false): only remote probes check nodes');
  }

  // Listener for remote probes
  const probePort = String(process.env.PROBE_PORT ?? '7443').trim();
  if (probePort && probePort !== '0' && probePort.toLowerCase() !== 'off') {
    try {
      const certificate = loadOrCreateCertificate(path.join(process.cwd(), 'data'));
      hub = new ProbeHub({
        registry, cert: certificate.cert, key: certificate.key,
        host: process.env.PROBE_LISTEN || '0.0.0.0', port: Number(probePort)
      });
      hub.fingerprint = certificate.fingerprint;
      await hub.start();
      schedulerService.watchProbes(hub);
      logger.info(`Probe certificate fingerprint (SHA-256): ${certificate.fingerprint}`);
    } catch (error) {
      hub = null;
      registry.hub = null;
      logger.error(`Probe listener disabled: ${error.message}`);
    }
  }

  // Initialize scheduler
  try {
    await schedulerService.init();
    logger.info('Scheduler initialized successfully');
  } catch (error) {
    logger.error(`Error initializing scheduler: ${error.message}`);
  }
});

// Graceful shutdown: stop timers, flush pending history, wait for the Mihomo child to exit.
let shuttingDown = false;
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason} received, shutting down gracefully`);
  try {
    schedulerService.stopMonitoring();
    registry.flushAll();
    if (hub) await hub.stop();
    await mihomoService.shutdown();
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
  }
  // Give winston's file transports a moment to flush.
  setTimeout(() => process.exit(exitCode), 200);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', reason => {
  logger.error(`Unhandled promise rejection: ${reason?.stack || reason}`);
});
process.on('uncaughtException', error => {
  logger.error(`Uncaught exception: ${error?.stack || error}`);
  shutdown('uncaughtException', 1);
});

module.exports = app;
