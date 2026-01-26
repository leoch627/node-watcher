const express = require('express');
const router = express.Router();
const config = require('../utils/config');
const notificationService = require('../services/notification');

// Get notification settings
router.get('/', (req, res) => {
  try {
    const cfg = config.getConfig();
    
    // Don't expose sensitive data
    const safeConfig = {
      bark: {
        enabled: cfg.notifications.bark.enabled,
        url: cfg.notifications.bark.url ? '***' : ''
      },
      email: {
        enabled: cfg.notifications.email.enabled,
        host: cfg.notifications.email.host,
        port: cfg.notifications.email.port,
        from: cfg.notifications.email.from,
        to: cfg.notifications.email.to
      },
      telegram: {
        enabled: cfg.notifications.telegram.enabled,
        botToken: cfg.notifications.telegram.botToken ? '***' : '',
        chatId: cfg.notifications.telegram.chatId ? '***' : ''
      }
    };

    res.json({
      success: true,
      notifications: safeConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update notification settings
router.put('/:type', (req, res) => {
  try {
    const { type } = req.params;
    const settings = req.body;

    if (!['bark', 'email', 'telegram'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification type'
      });
    }

    const success = config.updateNotificationSettings(type, settings);

    if (success) {
      // Reinitialize email transporter if email settings changed
      if (type === 'email') {
        notificationService.initEmailTransporter();
      }

      res.json({
        success: true,
        message: 'Notification settings updated'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update settings'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test notification
router.post('/test/:type', async (req, res) => {
  try {
    const { type } = req.params;

    if (!['bark', 'email', 'telegram'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification type'
      });
    }

    const result = await notificationService.testNotification(type);

    res.json({
      success: result.success,
      message: result.success ? 'Test notification sent' : 'Failed to send test notification',
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
