require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./utils/logger');
const config = require('./utils/config');
const schedulerService = require('./services/scheduler');
const authService = require('./services/auth');
const registry = require('./services/probes');
const { version } = require('../package.json');

// Import routes
const subscriptionsRouter = require('./routes/subscriptions');
const nodesRouter = require('./routes/nodes');
const notificationsRouter = require('./routes/notifications');
const systemRouter = require('./routes/system');
const manualNodesRouter = require('./routes/manualNodes');
const importsRouter = require('./routes/imports');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const backendsRouter = require('./routes/backends');
const deepTestsRouter = require('./routes/deepTests');
const unlockRouter = require('./routes/unlock');
const miaospeedBackends = require('./miaospeed/backends');
const { httpsConfigFromEnv, createHttpsListener, acmeChallenge, httpsRedirect } = require('./utils/https');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

// Built-in HTTPS (HTTPS_PORT): miaospeed only trusts publicly trusted certificates, so reverse links
// over wss:// need a Let's Encrypt certificate. The listener starts once the certificate files exist.
const httpsConfig = httpsConfigFromEnv();
const httpsListener = createHttpsListener({ ...httpsConfig, handler: app, onUpgrade: handleUpgrade });

// ACME HTTP-01 challenges (acme.sh webroot mode) come first: no redirect, auth or SPA fallback.
app.use(acmeChallenge({ webroot: httpsConfig.webroot }));
// Plain HTTP -> HTTPS while the HTTPS listener is up (health checks and reverse links are exempt).
if (httpsConfig.redirect && httpsConfig.port) {
  app.use(httpsRedirect({ publicPort: httpsConfig.publicPort, isActive: () => httpsListener.active }));
}

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
// Liveness: the web server is up. `status` reads "degraded" while the local miaospeed is enabled but
// not running (without it only remote backends can test).
const engineReady = () => !miaospeedBackends.local.enabled || miaospeedBackends.local.ready;
app.get('/api/health', (req, res) => {
  const ready = engineReady();
  res.json({
    success: true,
    status: ready ? 'ok' : 'degraded',
    message: ready ? 'Node Watcher is running' : 'Node Watcher is running, but the local miaospeed is not ready',
    version,
    engineReady: ready,
    https: httpsListener.status()
  });
});
// Readiness: 503 while the local test engine is down, so container health checks reflect it.
app.get('/api/ready', (req, res) => {
  const ready = engineReady();
  res.status(ready ? 200 : 503).json({ success: ready, engineReady: ready });
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
app.use('/api/backends', backendsRouter);
app.use('/api/deep-tests', deepTestsRouter);
app.use('/api/unlock', unlockRouter);

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

// Start server
const PORT = Number(process.env.PORT) || config.getConfig().server.port || 3000;

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const httpServer = app.listen(PORT, async () => {
  logger.info(`Node Watcher server started on port ${PORT}`);
  logger.info('🚀 Node Watcher is running!');
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔌 API: http://localhost:${PORT}/api`);
  logger.info(`📈 Public Stats: http://localhost:${PORT}/api/nodes/public`);

  // miaospeed backends: the local engine plus configured forward / reverse backends. The first
  // health check runs right after, so wait for the local engine to come up.
  await miaospeedBackends.start();

  // Initialize scheduler
  try {
    await schedulerService.init();
    logger.info('Scheduler initialized successfully');
  } catch (error) {
    logger.error(`Error initializing scheduler: ${error.message}`);
  }
});

// Reverse links from miaospeed backends (miaospeed server -connect ws(s)://<host>/miaospeed/reverse/<id>),
// on both the HTTP and the HTTPS listener. They authenticate with their own token, not the dashboard session.
function handleUpgrade(req, socket, head) {
  if (!miaospeedBackends.handleUpgrade(req, socket, head)) socket.destroy();
}
httpServer.on('upgrade', handleUpgrade);
httpsListener.start();

// Graceful shutdown: stop timers and the HTTPS listener, flush pending history, wait for the miaospeed
// child to exit.
let shuttingDown = false;
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason} received, shutting down gracefully`);
  try {
    schedulerService.stopMonitoring();
    registry.flushAll();
    // Not awaited: open connections (reverse links) end with miaospeedBackends.stop() or the exit.
    httpsListener.close();
    await miaospeedBackends.stop();
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
