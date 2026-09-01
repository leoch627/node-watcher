const express = require('express');
const router = express.Router();
const monitorService = require('../services/monitor');
const schedulerService = require('../services/scheduler');
const config = require('../utils/config');

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
    const job = await schedulerService.runHealthCheck({ reload: req.body?.reload === true });
    res.json({
      success: true,
      message: 'Health check completed',
      job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/media-check', (req, res) => {
  try {
    const nodeIds = Array.isArray(req.body?.nodeIds) ? req.body.nodeIds : [];
    const job = schedulerService.startMediaCheck(nodeIds);
    res.status(202).json({ success: true, job });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/jobs', (req, res) => {
  res.json({ success: true, jobs: schedulerService.getStatus().jobs });
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

// Delete (Exclude) a node
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    config.addNodeExclusion(id);
    
    // Reload to apply exclusion
    const nodes = await schedulerService.reloadSubscriptions();
    
    res.json({
      success: true,
      message: 'Node excluded successfully',
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
