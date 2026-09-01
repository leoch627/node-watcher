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
        url: '',
        urlConfigured: Boolean(cfg.notifications.bark.url)
      },
      email: {
        enabled: cfg.notifications.email.enabled,
        host: cfg.notifications.email.host,
        port: cfg.notifications.email.port,
        secure: cfg.notifications.email.secure,
        auth: {
          user: '',
          userConfigured: Boolean(cfg.notifications.email.auth.user),
          pass: '',
          passwordConfigured: Boolean(cfg.notifications.email.auth.pass)
        },
        from: cfg.notifications.email.from,
        to: cfg.notifications.email.to
      },
      telegram: {
        enabled: cfg.notifications.telegram.enabled,
        botToken: '',
        botTokenConfigured: Boolean(cfg.notifications.telegram.botToken),
        chatId: '',
        chatIdConfigured: Boolean(cfg.notifications.telegram.chatId)
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
    const settings = sanitizeSettings(type, req.body, config.getConfig().notifications[type]);

    if (!['bark', 'email', 'telegram'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification type'
      });
    }

    const validationError = validateSettings(type, settings);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

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

function sanitizeSettings(type, input = {}, current = {}) {
  const allowed = {
    bark: ['enabled', 'url'],
    email: ['enabled', 'host', 'port', 'secure', 'auth', 'from', 'to'],
    telegram: ['enabled', 'botToken', 'chatId']
  }[type] || [];
  const settings = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
  if (type === 'email') {
    const auth = Object.fromEntries(Object.entries(input.auth || {}).filter(([key]) => ['user', 'pass'].includes(key)));
    settings.auth = { ...(current.auth || {}), ...auth };
    settings.port = Number(settings.port ?? current.port);
    settings.secure = Boolean(settings.secure);
  }
  return { ...current, ...settings };
}

function validateSettings(type, settings) {
  if (!settings.enabled) return null;
  if (type === 'bark') {
    if (!/^https?:\/\//i.test(settings.url || '')) return '请输入完整的 Bark 推送地址';
  }
  if (type === 'email') {
    if (!settings.host || !settings.auth?.user || !settings.auth?.pass || !settings.from || !settings.to) return '请完整填写邮件服务器、账号、密码和收发件人';
    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) return '邮件端口必须在 1 到 65535 之间';
  }
  if (type === 'telegram' && (!settings.botToken || !settings.chatId)) return '请填写 Telegram Bot Token 和 Chat ID';
  return null;
}

module.exports.sanitizeSettings = sanitizeSettings;
module.exports.validateSettings = validateSettings;
