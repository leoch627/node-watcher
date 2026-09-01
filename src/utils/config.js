const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, '../../config.json');

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
        checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES, 10) || 5,
        timeoutSeconds: parseInt(process.env.TIMEOUT_SECONDS, 10) || 10,
        retryAttempts: 3,
        concurrency: parseInt(process.env.CHECK_CONCURRENCY, 10) || 8,
        customHealthCheckUrl: process.env.CUSTOM_HEALTH_CHECK_URL || ''
      },
      subscriptions: [],
      imports: [],
      excludeNodes: [],
      manualNodes: [],
      notifications: {
        bark: {
          enabled: process.env.BARK_ENABLED === 'true',
          url: process.env.BARK_URL || ''
        },
        email: {
          enabled: process.env.EMAIL_ENABLED === 'true',
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT, 10) || 587,
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
      id: crypto.randomUUID(),
      ...subscription,
      addedAt: new Date().toISOString()
    });
    return this.saveConfig();
  }

  updateSubscription(id, updates) {
    const index = (this.config.subscriptions || []).findIndex(item => item.id === id);
    if (index < 0) return false;
    this.config.subscriptions[index] = { ...this.config.subscriptions[index], ...updates, id };
    return this.saveConfig();
  }

  addImport(item) {
    if (!this.config.imports) this.config.imports = [];
    const value = {
      id: crypto.randomUUID(),
      name: item.name,
      content: item.content,
      enabled: item.enabled !== false,
      nodeCount: item.nodeCount || 0,
      addedAt: new Date().toISOString()
    };
    this.config.imports.push(value);
    this.saveConfig();
    return value;
  }

  removeImport(id) {
    const before = (this.config.imports || []).length;
    this.config.imports = (this.config.imports || []).filter(item => item.id !== id);
    if (this.config.imports.length === before) return false;
    return this.saveConfig();
  }

  addNodeExclusion(nodeName) {
    if (!this.config.excludeNodes) {
      this.config.excludeNodes = [];
    }
    if (!this.config.excludeNodes.includes(nodeName)) {
      this.config.excludeNodes.push(nodeName);
      return this.saveConfig();
    }
    return true;
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
      const current = this.config.notifications[type];
      this.config.notifications[type] = {
        ...current,
        ...settings,
        ...(type === 'email' && settings.auth ? {
          auth: { ...current.auth, ...settings.auth }
        } : {})
      };
      return this.saveConfig();
    }
    return false;
  }

  addManualNode(node) {
    if (!this.config.manualNodes) {
      this.config.manualNodes = [];
    }
    this.config.manualNodes.push({
      id: crypto.randomUUID(),
      ...node,
      addedAt: new Date().toISOString()
    });
    return this.saveConfig();
  }

  removeManualNode(id) {
    if (!this.config.manualNodes) {
      return false;
    }
    this.config.manualNodes = this.config.manualNodes.filter(node => node.id !== id);
    return this.saveConfig();
  }

  updateManualNode(id, updates) {
    if (!this.config.manualNodes) {
      return false;
    }
    const index = this.config.manualNodes.findIndex(node => node.id === id);
    if (index !== -1) {
      this.config.manualNodes[index] = { ...this.config.manualNodes[index], ...updates };
      return this.saveConfig();
    }
    return false;
  }
}

module.exports = new ConfigManager();
