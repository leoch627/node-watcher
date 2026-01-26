const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
      }
      return this.getDefaultConfig();
    } catch (error) {
      logger.error('Error loading config:', error);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      server: {
        port: process.env.PORT || 3000
      },
      monitoring: {
        checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5,
        timeoutSeconds: parseInt(process.env.TIMEOUT_SECONDS) || 10,
        retryAttempts: 3
      },
      subscriptions: [],
      notifications: {
        bark: {
          enabled: process.env.BARK_ENABLED === 'true',
          url: process.env.BARK_URL || ''
        },
        email: {
          enabled: process.env.EMAIL_ENABLED === 'true',
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT) || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: {
            user: process.env.EMAIL_USER || '',
            pass: process.env.EMAIL_PASSWORD || ''
          },
          from: process.env.EMAIL_FROM || '',
          to: process.env.EMAIL_TO || ''
        },
        telegram: {
          enabled: process.env.TELEGRAM_ENABLED === 'true',
          botToken: process.env.TELEGRAM_BOT_TOKEN || '',
          chatId: process.env.TELEGRAM_CHAT_ID || ''
        }
      }
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      logger.info('Configuration saved successfully');
      return true;
    } catch (error) {
      logger.error('Error saving config:', error);
      return false;
    }
  }

  getConfig() {
    return this.config;
  }

  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    return this.saveConfig();
  }

  addSubscription(subscription) {
    if (!this.config.subscriptions) {
      this.config.subscriptions = [];
    }
    this.config.subscriptions.push({
      id: Date.now().toString(),
      ...subscription,
      addedAt: new Date().toISOString()
    });
    return this.saveConfig();
  }

  removeSubscription(id) {
    if (!this.config.subscriptions) {
      return false;
    }
    this.config.subscriptions = this.config.subscriptions.filter(sub => sub.id !== id);
    return this.saveConfig();
  }

  updateNotificationSettings(type, settings) {
    if (this.config.notifications[type]) {
      this.config.notifications[type] = { ...this.config.notifications[type], ...settings };
      return this.saveConfig();
    }
    return false;
  }
}

module.exports = new ConfigManager();
