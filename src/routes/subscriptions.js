const express = require('express');
const router = express.Router();
const config = require('../utils/config');

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
router.post('/', (req, res) => {
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
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = config.removeSubscription(id);

    if (success) {
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
