const cron = require('node-cron');
const subscriptionService = require('./subscription');
const monitorService = require('./monitor');
const notificationService = require('./notification');
const mihomoService = require('./mihomo');
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

      // Load nodes from subscriptions
      for (const subscription of cfg.subscriptions) {
        if (subscription.enabled !== false) {
          try {
            logger.info(`Fetching subscription: ${subscription.name}`);
            const result = await subscriptionService.getNodes(subscription.url);
            
            let nodes = [];
            if (result.type === 'clash_direct') {
                logger.info(`Loaded ${result.proxies.length} proxies directly from Clash YAML`);
                // Normalize slightly for internal usage if needed, but keeping mostly raw
                nodes = result.proxies.map(p => ({
                    ...p, 
                    // Ensure internal code uses 'name'
                    name: p.name || 'Unknown', 
                    // Map type to protocol for any internal checks expecting 'protocol'
                    protocol: p.type 
                }));
            } else if (result.type === 'parsed') {
                nodes = result.nodes;
                logger.info(`Loaded ${nodes.length} nodes from ${subscription.name}`);
            } else if (Array.isArray(result)) {
                // Legacy fallback if service returns array directly
                nodes = result;
                logger.info(`Loaded ${nodes.length} nodes from ${subscription.name}`);
            }

            // Tag nodes with subscription source
            nodes = nodes.map(n => ({ ...n, subscription: subscription.name }));

            allNodes.push(...nodes);
          } catch (error) {
            logger.error(`Error loading subscription ${subscription.name}:`, error.message);
          }
        }
      }

      // Load manual nodes
      if (cfg.manualNodes && cfg.manualNodes.length > 0) {
        logger.info(`Loading ${cfg.manualNodes.length} manual nodes`);
        allNodes.push(...cfg.manualNodes.filter(node => node.enabled !== false));
      }

      // Filter excluded nodes
      const excludedNames = cfg.excludeNodes || [];
      const filteredNodes = allNodes.filter(n => !excludedNames.includes(n.name));

      this.nodes = filteredNodes;
      
      // Update Mihomo configuration with new nodes
      if (this.nodes.length > 0) {
         await mihomoService.updateProxies(this.nodes);
      }

      logger.info(`Total nodes loaded: ${this.nodes.length} (Excluded: ${allNodes.length - this.nodes.length})`);
      return this.nodes;
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
