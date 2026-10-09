const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const { writeFileAtomic } = require('./atomicWrite');

const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, '../../config.json');

class ConfigManager {
  constructor(file = CONFIG_FILE) {
    this.file = file;
    this.config = this.loadConfig();
  }

  readConfigFile(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('configuration root must be a JSON object');
    }
    return parsed;
  }

  // Fill keys that newer versions added (monitoring.*) and make sure every notification channel exists.
  withDefaults(loaded) {
    const defaults = this.getDefaultConfig();
    const merged = { ...defaults, ...loaded };
    merged.server = { ...defaults.server, ...(loaded.server || {}) };
    merged.monitoring = { ...defaults.monitoring, ...(loaded.monitoring || {}) };
    const notifications = { ...(loaded.notifications || {}) };
    for (const key of Object.keys(defaults.notifications)) {
      if (!notifications[key] || typeof notifications[key] !== 'object') notifications[key] = defaults.notifications[key];
    }
    if (!notifications.email.auth || typeof notifications.email.auth !== 'object') {
      notifications.email = { ...notifications.email, auth: { user: '', pass: '' } };
    }
    merged.notifications = notifications;
    return merged;
  }

  loadConfig() {
    if (!fs.existsSync(this.file)) return this.getDefaultConfig();
    try {
      return this.withDefaults(this.readConfigFile(this.file));
    } catch (error) {
      logger.error(`Error loading config: ${error.message}`);
    }
    // The primary file is unreadable: prefer the last known-good backup, and never let a later save
    // silently overwrite the damaged original.
    const backup = `${this.file}.bak`;
    try {
      if (fs.existsSync(backup)) {
        const recovered = this.withDefaults(this.readConfigFile(backup));
        logger.warn(`Recovered configuration from ${path.basename(backup)}`);
        this.quarantine();
        return recovered;
      }
    } catch (error) {
      logger.error(`Backup configuration is unreadable too: ${error.message}`);
    }
    this.quarantine();
    return this.getDefaultConfig();
  }

  quarantine() {
    const target = `${this.file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(this.file, target);
      logger.warn(`Moved unreadable configuration to ${path.basename(target)}`);
    } catch (error) {
      logger.error(`Could not move unreadable configuration aside: ${error.message}`);
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
        // Extra immediate probes after a failed probe (0-3).
        retryAttempts: process.env.RETRY_ATTEMPTS !== undefined && process.env.RETRY_ATTEMPTS !== ''
          ? Math.max(0, parseInt(process.env.RETRY_ATTEMPTS, 10) || 0) : 1,
        // Consecutive failed checks before a node is reported offline.
        failureThreshold: parseInt(process.env.FAILURE_THRESHOLD, 10) || 2,
        // How often subscriptions are re-downloaded (independent of the probe interval).
        subscriptionRefreshMinutes: parseInt(process.env.SUBSCRIPTION_REFRESH_MINUTES, 10) || 30,
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
      // Keep the previous good file as a backup (only if it still parses).
      if (fs.existsSync(this.file)) {
        try {
          this.readConfigFile(this.file);
          fs.copyFileSync(this.file, `${this.file}.bak`);
        } catch (error) {
          logger.warn(`Skipped configuration backup: ${error.message}`);
        }
      }
      writeFileAtomic(this.file, JSON.stringify(this.config, null, 2));
      logger.info('Configuration saved successfully');
      return true;
    } catch (error) {
      logger.error(`Error saving config: ${error.message}`);
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
module.exports.ConfigManager = ConfigManager;
