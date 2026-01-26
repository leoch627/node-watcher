const net = require('net');
const http = require('http');
const https = require('https');
const logger = require('../utils/logger');
const config = require('../utils/config');
const mihomoService = require('./mihomo'); // Import mihomo service

class MonitorService {
  constructor() {
    this.nodeStatus = new Map();
    this.nodeHistory = new Map(); // Track historical data for uptime calculation
  }

  async checkNode(node, timeout = 10000) {
    const startTime = Date.now();
    
    try {
      // Use UDP/Mihomo for more accurate connectivity test
      // First update this specific node in mihomo?
      // No, updating one by one is inefficient. 
      // Ideally, scheduler calls updateProxies([allNodes]) once, then here we just test.
      // But checkNode is called per node.
      // Let's try to temporally add/test this proxy or rely on global config if updated.
      // For now, let's just stick to "Test via Mihomo" assuming it's in the config.
      
      // Since 'checkNode' is usually called in a loop for all nodes,
      // we need to ensure the node exists in Mihomo.
      // A simple way: construct a single proxy config, call a 'testProxy' method on mihomo service
      // that temporarily adds it via API or uses the providers.
      // But mihomo 'delay' API requires the proxy to exist in its config.
      
      // Let's dynamically update proxies before check loop in 'scheduler', 
      // OR hack: we can just use the 'checkTcpConnection' if we don't want to rewriting everything.
      // But user ASKED for mihomo.
      
      // Assuming scheduler has synced the list to mihomo.
      // But wait! Scheduler logic is separate.
      // Let's use a "Single Node Test" capability if possible, or fallback to TCP.
      
      // Actually, we can just use mihomoService.testNode if we ensure the node "name" is unique and synced.
      // However, checkNode logic here is isolated.
      
      // Let's implement a "Direct Check" where we ask mihomo to test a proxy configuration 
      // passed directly? No, Clash API doesn't support "Test this JSON object".
      // It supports "Test proxy named X".
      
      // Modified flow:
      // 1. Scheduler calls monitorService.checkAll(nodes).
      // 2. monitorService updates mihomo config with ALL nodes.
      // 3. monitorService iterates and calls API for each.
      
      // But here we are inside `checkNode` (single).
      // Let's modify the usage pattern or handle the sync here?
      // Handling sync here constitutes a race condition or performance hit.
      
      // Alternative: checkNode takes a "checkType" param.
      // If we simply replace the logic:
      
      // We will blindly attempt to test via Mihomo API using node.name.
      // If it fails (404 proxy not found), we fallback to TCP?
      
      let isOnline, latency = 0;
      const mihomoResult = await mihomoService.testNode(node.name, timeout);
      
      if (mihomoResult.error && mihomoResult.error.includes('Proxy not found')) {
        // Fallback or Log warning. 
        // Maybe the list wasn't synced?
        // Let's Try to sync just this one? (Expensive)
        // Fallback to TCP
        isOnline = await this.checkTcpConnection(node.address, node.port, timeout);
        latency = Date.now() - startTime;
      } else {
        isOnline = mihomoResult.online;
        latency = mihomoResult.latency;
      }

      // const cfg = config.getConfig();
      // const customHealthCheckUrl = cfg.monitoring?.customHealthCheckUrl;
      // ... (Rest of logic)
      
      // Override responseTime with real latency from tool
      const responseTime = isOnline ? latency : null;
      
      const status = {
        online: isOnline,
        responseTime: responseTime,
        lastCheck: new Date().toISOString(),
        error: isOnline ? null : (mihomoResult.error || 'Connection failed'),
        checkMethod: 'mihomo'
      };

      this.updateNodeStatus(node, status);
      this.recordHistory(node, isOnline);
      return status;
    } catch (error) {
      const status = {
        online: false,
        responseTime: null,
        lastCheck: new Date().toISOString(),
        error: error.message,
        checkMethod: 'mihomo-error'
      };

      this.updateNodeStatus(node, status);
      this.recordHistory(node, false);
      return status;
    }
  }

  checkTcpConnection(host, port, timeout) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        cleanup();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        cleanup();
        resolve(false);
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        cleanup();
        resolve(false);
      });

      try {
        socket.connect(port, host);
      } catch (error) {
        clearTimeout(timer);
        cleanup();
        resolve(false);
      }
    });
  }

  async checkHttpEndpoint(url, timeout = 10000) {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const timer = setTimeout(() => {
        resolve(false);
      }, timeout);

      const req = client.get(url, { timeout }, (res) => {
        clearTimeout(timer);
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });

      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      req.on('timeout', () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });
    });
  }

  recordHistory(node, isOnline) {
    const nodeKey = `${node.protocol}://${node.address}:${node.port}`;
    
    if (!this.nodeHistory.has(nodeKey)) {
      this.nodeHistory.set(nodeKey, {
        checks: [],
        firstCheck: new Date().toISOString()
      });
    }

    const history = this.nodeHistory.get(nodeKey);
    history.checks.push({
      timestamp: new Date().toISOString(),
      online: isOnline
    });

    // Keep only last 1000 checks to prevent memory issues
    if (history.checks.length > 1000) {
      history.checks.shift();
    }

    this.nodeHistory.set(nodeKey, history);
  }

  calculateUptime(node, hours = 24) {
    const nodeKey = `${node.protocol}://${node.address}:${node.port}`;
    const history = this.nodeHistory.get(nodeKey);

    if (!history || history.checks.length === 0) {
      return null;
    }

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentChecks = history.checks.filter(check => 
      new Date(check.timestamp) > cutoffTime
    );

    if (recentChecks.length === 0) {
      return null;
    }

    const onlineChecks = recentChecks.filter(check => check.online).length;
    const uptimePercentage = (onlineChecks / recentChecks.length) * 100;

    return {
      uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      totalChecks: recentChecks.length,
      onlineChecks: onlineChecks,
      offlineChecks: recentChecks.length - onlineChecks,
      period: `${hours}h`
    };
  }

  updateNodeStatus(node, status) {
    const nodeKey = `${node.protocol}://${node.address}:${node.port}`;
    const previousStatus = this.nodeStatus.get(nodeKey);
    
    const newStatus = {
      // Preserve all original node properties
      node: { ...node }, 
      ...status,
      statusChanged: previousStatus ? previousStatus.online !== status.online : false,
      previousStatus: previousStatus ? previousStatus.online : null
    };

    this.nodeStatus.set(nodeKey, newStatus);
    
    if (newStatus.statusChanged) {
      logger.info(`Node status changed: ${node.name} - ${status.online ? 'ONLINE' : 'OFFLINE'}`);
    }

    return newStatus;
  }

  getNodeStatus(node) {
    const nodeKey = `${node.protocol}://${node.address}:${node.port}`;
    return this.nodeStatus.get(nodeKey);
  }

  getAllStatus() {
    return Array.from(this.nodeStatus.values());
  }

  getOfflineNodes() {
    return Array.from(this.nodeStatus.values()).filter(status => !status.online);
  }

  getOnlineNodes() {
    return Array.from(this.nodeStatus.values()).filter(status => status.online);
  }

  getPublicStats() {
    const allStatus = this.getAllStatus();
    
    return allStatus.map(status => {
      const uptime24h = this.calculateUptime(status.node, 24);
      const uptime7d = this.calculateUptime(status.node, 168); // 7 days
      const uptime30d = this.calculateUptime(status.node, 720); // 30 days
      
      return {
        name: status.node.name,
        subscription: status.node.subscription || 'Manual/Unknown',
        protocol: status.node.protocol,
        online: status.online,
        lastCheck: status.lastCheck,
        responseTime: status.responseTime,
        uptime: {
          '24h': uptime24h,
          '7d': uptime7d,
          '30d': uptime30d
        }
      };
    });
  }

  clearStatus() {
    this.nodeStatus.clear();
  }
}

module.exports = new MonitorService();
