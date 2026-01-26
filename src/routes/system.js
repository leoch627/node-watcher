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

// Update monitoring settings
router.put('/monitoring', (req, res) => {
  try {
    const { checkIntervalMinutes, timeoutSeconds, retryAttempts, customHealthCheckUrl } = req.body;
    const cfg = config.getConfig();

    if (checkIntervalMinutes) {
      const interval = parseInt(checkIntervalMinutes, 10);
      if (isNaN(interval) || interval < 1) {
        return res.status(400).json({
          success: false,
          error: 'Check interval must be a positive number'
        });
      }
      cfg.monitoring.checkIntervalMinutes = interval;
    }
    if (timeoutSeconds) {
      const timeout = parseInt(timeoutSeconds, 10);
      if (isNaN(timeout) || timeout < 1) {
        return res.status(400).json({
          success: false,
          error: 'Timeout must be a positive number'
        });
      }
      cfg.monitoring.timeoutSeconds = timeout;
    }
    if (retryAttempts !== undefined) {
      const retries = parseInt(retryAttempts, 10);
      if (isNaN(retries) || retries < 0) {
        return res.status(400).json({
          success: false,
          error: 'Retry attempts must be a non-negative number'
        });
      }
      cfg.monitoring.retryAttempts = retries;
    }
    if (customHealthCheckUrl !== undefined) {
      cfg.monitoring.customHealthCheckUrl = customHealthCheckUrl;
    }

    config.updateConfig(cfg);

    // Restart monitoring with new interval
    if (checkIntervalMinutes) {
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
