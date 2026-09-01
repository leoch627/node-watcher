const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../utils/config');

class NotificationService {
  constructor(dependencies = {}) {
    this.http = dependencies.http || axios;
    this.mailer = dependencies.mailer || nodemailer;
    this.config = dependencies.config || config;
    this.emailTransporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    const emailConfig = this.config.getConfig().notifications.email;
    this.emailTransporter = null;
    
    if (emailConfig.enabled && emailConfig.auth.user) {
      try {
        this.emailTransporter = this.mailer.createTransport({
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          auth: {
            user: emailConfig.auth.user,
            pass: emailConfig.auth.pass
          }
        });
        logger.info('Email transporter initialized');
      } catch (error) {
        logger.error('Error initializing email transporter:', error);
      }
    }
  }

  async sendNotification(node, status) {
    if (!status.statusChanged) return [];
    const notifications = this.config.getConfig().notifications;
    const tasks = [];
    if (notifications.bark.enabled) tasks.push(this.sendBarkNotification(node, status));
    if (notifications.email.enabled) tasks.push(this.sendEmailNotification(node, status));
    if (notifications.telegram.enabled) tasks.push(this.sendTelegramNotification(node, status));
    return Promise.all(tasks);
  }

  getAlert(node, status) {
    const online = Boolean(status.online);
    const state = online ? '已恢复' : '已离线';
    const title = online ? '节点恢复通知' : '节点离线告警';
    const address = node.server || node.address || '-';
    const checkedAt = new Date(status.lastCheck || Date.now()).toLocaleString('zh-CN', { hour12: false });
    return {
      online,
      title,
      message: [
        `节点: ${node.name}`,
        `状态: ${state}`,
        `协议: ${node.protocol || '-'}`,
        `地址: ${address}:${node.port || '-'}`,
        `检测时间: ${checkedAt}`,
        ...(!online ? [`错误: ${status.error || '连接超时'}`] : [])
      ].join('\n')
    };
  }

  async sendBarkNotification(node, status) {
    try {
      const barkConfig = this.config.getConfig().notifications.bark;
      
      if (!barkConfig.url) {
        throw new Error('Bark URL not configured');
      }

      const alert = this.getAlert(node, status);
      const baseUrl = barkConfig.url.replace(/\/$/, '');
      const url = `${baseUrl}/${encodeURIComponent(alert.title)}/${encodeURIComponent(alert.message)}`;
      await this.http.get(url, { timeout: 10000, params: { group: 'Node Watcher' } });
      
      logger.info(`Bark notification sent for node: ${node.name}`);
      return { service: 'bark', success: true };
    } catch (error) {
      logger.error(`Error sending Bark notification for ${node.name}:`, error.message);
      return { service: 'bark', success: false, error: error.message };
    }
  }

  async sendEmailNotification(node, status) {
    try {
      const emailConfig = this.config.getConfig().notifications.email;
      
      if (!this.emailTransporter) {
        this.initEmailTransporter();
      }

      if (!this.emailTransporter) {
        throw new Error('Email transporter not initialized');
      }

      const alert = this.getAlert(node, status);
      const color = alert.online ? '#047857' : '#b91c1c';
      const mailOptions = {
        from: emailConfig.from,
        to: emailConfig.to,
        subject: `[Node Watcher] ${alert.title} - ${node.name}`,
        html: `
          <h2 style="color:${color}">${escapeHtml(alert.title)}</h2>
          ${alert.message.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          <hr>
          <p style="color:#666;font-size:12px">Node Watcher 自动通知</p>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
      
      logger.info(`Email notification sent for node: ${node.name}`);
      return { service: 'email', success: true };
    } catch (error) {
      logger.error(`Error sending email notification for ${node.name}:`, error.message);
      return { service: 'email', success: false, error: error.message };
    }
  }

  async sendTelegramNotification(node, status) {
    try {
      const telegramConfig = this.config.getConfig().notifications.telegram;
      
      if (!telegramConfig.botToken || !telegramConfig.chatId) {
        throw new Error('Telegram bot token or chat ID not configured');
      }

      const alert = this.getAlert(node, status);
      const message = `<b>${alert.online ? '🟢' : '🔴'} ${escapeHtml(alert.title)}</b>\n\n${escapeHtml(alert.message)}`;

      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
      
      await this.http.post(url, {
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: 'HTML'
      }, { timeout: 10000 });

      logger.info(`Telegram notification sent for node: ${node.name}`);
      return { service: 'telegram', success: true };
    } catch (error) {
      logger.error(`Error sending Telegram notification for ${node.name}:`, error.message);
      return { service: 'telegram', success: false, error: error.message };
    }
  }

  async testNotification(service) {
    const testNode = {
      name: 'Test Node',
      protocol: 'vmess',
      address: 'test.example.com',
      port: 443
    };

    const testStatus = {
      online: false,
      statusChanged: true,
      lastCheck: new Date().toISOString(),
      error: 'This is a test notification'
    };

    switch (service) {
      case 'bark':
        return await this.sendBarkNotification(testNode, testStatus);
      case 'email':
        return await this.sendEmailNotification(testNode, testStatus);
      case 'telegram':
        return await this.sendTelegramNotification(testNode, testStatus);
      default:
        return { success: false, error: 'Unknown service' };
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

const notificationService = new NotificationService();
module.exports = notificationService;
module.exports.NotificationService = NotificationService;
module.exports.escapeHtml = escapeHtml;
