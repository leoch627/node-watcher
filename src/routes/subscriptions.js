const express = require('express');
const router = express.Router();
const config = require('../utils/config');
const schedulerService = require('../services/scheduler');

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

    config.addSubscription({
      name,
      url,
      enabled: enabled !== false
    });

    await schedulerService.reloadSubscriptions();

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

// Delete subscription
router.patch('/:id', async (req, res) => {
  const updates = {};
  if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
  if (typeof req.body.url === 'string' && req.body.url.trim()) updates.url = req.body.url.trim();
  if (typeof req.body.enabled === 'boolean') updates.enabled = req.body.enabled;
  if (!config.updateSubscription(req.params.id, updates)) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }
  await schedulerService.reloadSubscriptions();
  return res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = config.removeSubscription(id);

    if (success) {
      await schedulerService.reloadSubscriptions();
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
