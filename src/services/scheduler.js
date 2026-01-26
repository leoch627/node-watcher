const cron = require('node-cron');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const config = require('../utils/config');
const logger = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.tasks = [];
    this.isRunning = false;
    this.nodes = [];
  }

  async init() {
    logger.info('Initializing scheduler service...');
    await this.loadNodes();
    this.startMonitoring();
  }

  async loadNodes() {
    try {
      const cfg = config.getConfig();
      const allNodes = [];

      for (const subscription of cfg.subscriptions) {
        if (subscription.enabled !== false) {
          try {
            logger.info(`Fetching subscription: ${subscription.name}`);
            const nodes = await subscriptionService.getNodes(subscription.url);
            logger.info(`Loaded ${nodes.length} nodes from ${subscription.name}`);
            allNodes.push(...nodes);
          } catch (error) {
            logger.error(`Error loading subscription ${subscription.name}:`, error.message);
          }
        }
      }

      this.nodes = allNodes;
      logger.info(`Total nodes loaded: ${this.nodes.length}`);
      return allNodes;
    } catch (error) {
      logger.error('Error loading nodes:', error);
      return [];
    }
  }

  startMonitoring() {
    const cfg = config.getConfig();
    const intervalMinutes = cfg.monitoring.checkIntervalMinutes || 5;

    // Stop existing tasks
    this.stopMonitoring();

    // Run immediately on start
    this.runHealthCheck();

    // Schedule periodic checks
    const cronExpression = `*/${intervalMinutes} * * * *`;
    logger.info(`Starting monitoring with interval: ${intervalMinutes} minutes`);

    const task = cron.schedule(cronExpression, async () => {
      await this.runHealthCheck();
    });

    this.tasks.push(task);
    this.isRunning = true;
  }

  async runHealthCheck() {
    if (this.nodes.length === 0) {
      logger.warn('No nodes to check. Loading subscriptions...');
      await this.loadNodes();
      
      if (this.nodes.length === 0) {
        logger.warn('Still no nodes available after loading subscriptions');
        return;
      }
    }

    logger.info(`Running health check for ${this.nodes.length} nodes...`);
    const cfg = config.getConfig();
    const timeout = (cfg.monitoring.timeoutSeconds || 10) * 1000;

    const checkPromises = this.nodes.map(async (node) => {
      try {
        const status = await monitorService.checkNode(node, timeout);
        
        // Send notification if node went offline
        if (status.statusChanged && !status.online) {
          await notificationService.sendNotification(node, status);
        }

        return status;
      } catch (error) {
        logger.error(`Error checking node ${node.name}:`, error.message);
        return null;
      }
    });

    const results = await Promise.all(checkPromises);
    const successfulChecks = results.filter(r => r !== null);
    
    logger.info(`Health check completed: ${successfulChecks.length}/${this.nodes.length} nodes checked`);
    
    return results;
  }

  stopMonitoring() {
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    this.isRunning = false;
    logger.info('Monitoring stopped');
  }

  async reloadSubscriptions() {
    logger.info('Reloading subscriptions...');
    await this.loadNodes();
    return this.nodes;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      totalNodes: this.nodes.length,
      onlineNodes: monitorService.getOnlineNodes().length,
      offlineNodes: monitorService.getOfflineNodes().length,
      lastCheck: this.nodes.length > 0 ? monitorService.getAllStatus()[0]?.lastCheck : null
    };
  }
}

module.exports = new SchedulerService();
