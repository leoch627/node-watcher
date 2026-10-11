const express = require('express');
const router = express.Router();
const schedulerService = require('../services/scheduler');
const config = require('../utils/config');
const registry = require('../services/probes');

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

// Counts leave out nodes that left their subscription (listed, but no longer checked).
function summarize(statuses) {
  const active = statuses.filter(item => !item.node.retired);
  return {
    total: active.length,
    online: active.filter(item => item.online === true).length,
    offline: active.filter(item => item.online === false).length,
    pending: active.filter(item => item.online == null).length,
    retired: statuses.length - active.length
  };
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
      summary: summarize(status)
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
      summary: summarize(stats)
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
    
    // Rebuild the node list to apply the exclusion
    const nodes = await schedulerService.rebuildNodes();
    
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
