require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./utils/logger');
const config = require('./utils/config');
const schedulerService = require('./services/scheduler');
const mihomoService = require('./services/mihomo');
const monitorService = require('./services/monitor');
const authService = require('./services/auth');

// Import routes
const subscriptionsRouter = require('./routes/subscriptions');
const nodesRouter = require('./routes/nodes');
const notificationsRouter = require('./routes/notifications');
const systemRouter = require('./routes/system');
const manualNodesRouter = require('./routes/manualNodes');
const importsRouter = require('./routes/imports');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

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
app.get('/api/health', (req, res) => {
  const mihomoReady = mihomoService.ready;
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
  const mihomoReady = mihomoService.ready;
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

app.listen(PORT, async () => {
  logger.info(`Node Watcher server started on port ${PORT}`);
  logger.info('🚀 Node Watcher is running!');
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔌 API: http://localhost:${PORT}/api`);
  logger.info(`📈 Public Stats: http://localhost:${PORT}/api/nodes/public`);

  // Start Mihomo Core
  try {
     await mihomoService.start();
  } catch (e) {
     logger.error("Failed to start Mihomo service", e);
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
    monitorService.flushSync();
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
