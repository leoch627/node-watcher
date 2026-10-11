const express = require('express');
const router = express.Router();
const config = require('../utils/config');
const schedulerService = require('../services/scheduler');

// Get system status
router.get('/status', (req, res) => {
  try {
    const status = schedulerService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get configuration
router.get('/config', (req, res) => {
  try {
    const cfg = config.getConfig();
    
    // Don't expose sensitive data
    const safeConfig = {
      server: cfg.server,
      monitoring: cfg.monitoring
    };

    res.json({
      success: true,
      config: safeConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update monitoring settings. Every provided field is validated first; nothing is applied unless all are valid.
const INTEGER_FIELDS = [
  ['checkIntervalMinutes', 1, 1440, 'Check interval'],
  // miaospeed accepts per-request timeouts up to 10 s.
  ['timeoutSeconds', 1, 10, 'Timeout'],
  ['retryAttempts', 0, 3, 'Retry attempts'],
  ['failureThreshold', 1, 10, 'Failure threshold'],
  ['subscriptionRefreshMinutes', 1, 1440, 'Subscription refresh interval']
];

router.put('/monitoring', (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};

    for (const [key, min, max, label] of INTEGER_FIELDS) {
      if (body[key] === undefined || body[key] === null || body[key] === '') continue;
      const value = Number(body[key]);
      if (!Number.isInteger(value) || value < min || value > max) {
        return res.status(400).json({
          success: false,
          error: `${label} must be an integer between ${min} and ${max}`
        });
      }
      updates[key] = value;
    }

    if (body.customHealthCheckUrl !== undefined) {
      const url = String(body.customHealthCheckUrl || '').trim();
      if (url) {
        let parsed;
        try { parsed = new URL(url); } catch (_) { parsed = null; }
        if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({
            success: false,
            error: 'Custom health check URL must be a valid HTTP or HTTPS URL'
          });
        }
      }
      updates.customHealthCheckUrl = url;
    }

    const cfg = config.getConfig();
    cfg.monitoring = { ...(cfg.monitoring || {}), ...updates };
    config.updateConfig(cfg);

    // Restart the timers when either interval changed
    if (updates.checkIntervalMinutes !== undefined || updates.subscriptionRefreshMinutes !== undefined) {
      schedulerService.startMonitoring();
    }

    res.json({
      success: true,
      message: 'Monitoring settings updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
