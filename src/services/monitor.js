const net = require('net');
const http = require('http');
const https = require('https');
const logger = require('../utils/logger');

class MonitorService {
  constructor() {
    this.nodeStatus = new Map();
    this.nodeHistory = new Map(); // Track historical data for uptime calculation
  }

  async checkNode(node, timeout = 10000) {
    const startTime = Date.now();
    
    try {
      // For most proxy protocols, we'll do a TCP connection check
      const isOnline = await this.checkTcpConnection(node.address, node.port, timeout);
      const responseTime = Date.now() - startTime;
      
      const status = {
        online: isOnline,
        responseTime: isOnline ? responseTime : null,
        lastCheck: new Date().toISOString(),
        error: null
      };

      this.updateNodeStatus(node, status);
      this.recordHistory(node, isOnline);
      return status;
    } catch (error) {
      const status = {
        online: false,
        responseTime: null,
        lastCheck: new Date().toISOString(),
        error: error.message
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
        resolve(res.statusCode >= 200 && res.statusCode < 500);
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
      node: {
        name: node.name,
        protocol: node.protocol,
        address: node.address,
        port: node.port
      },
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
