const express = require('express');
const router = express.Router();
const monitorService = require('../services/monitor');
const schedulerService = require('../services/scheduler');

// Get all node status
router.get('/', (req, res) => {
  try {
    const status = monitorService.getAllStatus();
    res.json({
      success: true,
      nodes: status,
      summary: {
        total: status.length,
        online: monitorService.getOnlineNodes().length,
        offline: monitorService.getOfflineNodes().length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get public statistics (for visitors)
router.get('/public', (req, res) => {
  try {
    const stats = monitorService.getPublicStats();
    res.json({
      success: true,
      stats: stats,
      summary: {
        total: stats.length,
        online: stats.filter(s => s.online).length,
        offline: stats.filter(s => !s.online).length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger manual health check
router.post('/check', async (req, res) => {
  try {
    await schedulerService.runHealthCheck();
    res.json({
      success: true,
      message: 'Health check initiated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reload subscriptions
router.post('/reload', async (req, res) => {
  try {
    const nodes = await schedulerService.reloadSubscriptions();
    res.json({
      success: true,
      message: 'Subscriptions reloaded',
      nodeCount: nodes.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
