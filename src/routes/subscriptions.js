const express = require('express');
const router = express.Router();
const config = require('../utils/config');
const schedulerService = require('../services/scheduler');

// Per-subscription auto-refresh interval: null/'' follows the global setting, 0 = manual only.
const MAX_REFRESH_MINUTES = 10080;
function parseRefreshMinutes(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_REFRESH_MINUTES) {
    throw new RangeError(`Refresh interval must be an integer between 0 and ${MAX_REFRESH_MINUTES} minutes`);
  }
  return minutes;
}

// Get all subscriptions
router.get('/', (req, res) => {
  try {
    const cfg = config.getConfig();
    res.json({
      success: true,
      subscriptions: cfg.subscriptions || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add subscription
router.post('/', async (req, res) => {
  try {
    const { name, url, enabled } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Name and URL are required'
      });
    }
    let refreshMinutes;
    try { refreshMinutes = parseRefreshMinutes(req.body.refreshMinutes); } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    config.addSubscription({
      name,
      url,
      enabled: enabled !== false,
      ...(refreshMinutes != null ? { refreshMinutes } : {})
    });

    await schedulerService.rebuildNodes();

    res.json({
      success: true,
      message: 'Subscription added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update subscription (a changed URL is downloaded again, everything else reuses the last fetch)
router.patch('/:id', async (req, res) => {
  const updates = {};
  if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
  if (typeof req.body.url === 'string' && req.body.url.trim()) updates.url = req.body.url.trim();
  if (typeof req.body.enabled === 'boolean') updates.enabled = req.body.enabled;
  try {
    const refreshMinutes = parseRefreshMinutes(req.body.refreshMinutes);
    if (refreshMinutes !== undefined) updates.refreshMinutes = refreshMinutes;
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (!config.updateSubscription(req.params.id, updates)) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }
  await schedulerService.rebuildNodes();
  return res.json({ success: true });
});

// Download one subscription now
router.post('/:id/refresh', async (req, res) => {
  const subscription = (config.getConfig().subscriptions || []).find(item => item.id === req.params.id);
  if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });
  if (subscription.enabled === false) return res.status(400).json({ success: false, error: '订阅已停用' });
  try {
    const status = await schedulerService.refreshSubscription(subscription.id);
    if (status && !status.ok) {
      return res.status(502).json({ success: false, error: status.error || 'Refresh failed', status });
    }
    return res.json({ success: true, status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete subscription
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = config.removeSubscription(id);

    if (success) {
      await schedulerService.rebuildNodes();
      res.json({
        success: true,
        message: 'Subscription removed successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
