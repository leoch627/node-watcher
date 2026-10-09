const express = require('express');
const router = express.Router();
const schedulerService = require('../services/scheduler');
const config = require('../utils/config');
const registry = require('../probe/registry');

// The probe a request is about (?probe=<id>); defaults to the first listed probe.
function probeFrom(req) {
  const id = String(req.query.probe || req.body?.probeId || registry.defaultProbeId());
  const monitor = registry.monitorFor(id);
  if (!monitor) return null;
  const listed = registry.list().find(item => item.id === id);
  return { id, name: listed?.name || id, monitor };
}

function withProbes(statuses) {
  if (registry.list().length < 2) return statuses;
  return statuses.map(status => ({ ...status, probes: registry.nodeAcrossProbes(status.node.id) }));
}

// Get all node status
router.get('/', (req, res) => {
  try {
    const probe = probeFrom(req);
    if (!probe) return res.status(404).json({ success: false, error: 'Probe not found' });
    const status = withProbes(probe.monitor.getAllStatus());
    res.json({
      success: true,
      probe: { id: probe.id, name: probe.name },
      nodes: status,
      summary: {
        total: status.length,
        online: probe.monitor.getOnlineNodes().length,
        offline: probe.monitor.getOfflineNodes().length,
        pending: probe.monitor.getPendingNodes().length
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
    const probe = probeFrom(req);
    if (!probe) return res.status(404).json({ success: false, error: 'Probe not found' });
    const stats = withProbes(probe.monitor.getPublicStats());
    res.json({
      success: true,
      probe: { id: probe.id, name: probe.name },
      stats: stats,
      summary: {
        total: stats.length,
        online: stats.filter(s => s.online === true).length,
        offline: stats.filter(s => s.online === false).length,
        pending: stats.filter(s => s.online == null).length
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
    const probeId = typeof req.body?.probeId === 'string' ? req.body.probeId : null;
    const job = schedulerService.startMediaCheck(nodeIds, probeId);
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
