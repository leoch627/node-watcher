require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('./utils/logger');
const config = require('./utils/config');
const schedulerService = require('./services/scheduler');
const mihomoService = require('./services/mihomo');

// Import routes
const subscriptionsRouter = require('./routes/subscriptions');
const nodesRouter = require('./routes/nodes');
const notificationsRouter = require('./routes/notifications');
const systemRouter = require('./routes/system');
const manualNodesRouter = require('./routes/manualNodes');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/system', systemRouter);
app.use('/api/manual-nodes', manualNodesRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Node Watcher is running',
    version: '1.0.0'
  });
});

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
const PORT = config.getConfig().server.port || 3000;

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
    logger.error('Error initializing scheduler:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mihomoService.stop();
  schedulerService.stopMonitoring();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  schedulerService.stopMonitoring();
  process.exit(0);
});

module.exports = app;
