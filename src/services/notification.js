const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../utils/config');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initEmailTransporter();
  }

  initEmailTransporter() {
    const emailConfig = config.getConfig().notifications.email;
    
    if (emailConfig.enabled && emailConfig.auth.user) {
      try {
        this.emailTransporter = nodemailer.createTransporter({
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
    const notifications = config.getConfig().notifications;
    const results = [];

    // Only send notification on status change to offline
    if (status.statusChanged && !status.online) {
      if (notifications.bark.enabled) {
        results.push(await this.sendBarkNotification(node, status));
      }

      if (notifications.email.enabled) {
        results.push(await this.sendEmailNotification(node, status));
      }

      if (notifications.telegram.enabled) {
        results.push(await this.sendTelegramNotification(node, status));
      }
    }

    return results;
  }

  async sendBarkNotification(node, status) {
    try {
      const barkConfig = config.getConfig().notifications.bark;
      
      if (!barkConfig.url) {
        throw new Error('Bark URL not configured');
      }

      const title = '节点离线通知 / Node Offline Alert';
      const message = `节点 ${node.name} 已离线\nNode ${node.name} is offline\n协议: ${node.protocol}\n地址: ${node.address}:${node.port}`;
      
      const url = `${barkConfig.url}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
      
      await axios.get(url, { timeout: 10000 });
      
      logger.info(`Bark notification sent for node: ${node.name}`);
      return { service: 'bark', success: true };
    } catch (error) {
      logger.error(`Error sending Bark notification for ${node.name}:`, error.message);
      return { service: 'bark', success: false, error: error.message };
    }
  }

  async sendEmailNotification(node, status) {
    try {
      const emailConfig = config.getConfig().notifications.email;
      
      if (!this.emailTransporter) {
        this.initEmailTransporter();
      }

      if (!this.emailTransporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: emailConfig.from,
        to: emailConfig.to,
        subject: `节点离线通知 - ${node.name}`,
        html: `
          <h2>节点离线通知 / Node Offline Alert</h2>
          <p><strong>节点名称 / Node Name:</strong> ${node.name}</p>
          <p><strong>协议 / Protocol:</strong> ${node.protocol}</p>
          <p><strong>地址 / Address:</strong> ${node.address}</p>
          <p><strong>端口 / Port:</strong> ${node.port}</p>
          <p><strong>检测时间 / Check Time:</strong> ${status.lastCheck}</p>
          <p><strong>错误信息 / Error:</strong> ${status.error || 'Connection timeout'}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from Node Watcher</p>
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
      const telegramConfig = config.getConfig().notifications.telegram;
      
      if (!telegramConfig.botToken || !telegramConfig.chatId) {
        throw new Error('Telegram bot token or chat ID not configured');
      }

      const message = `
🔴 *节点离线通知 / Node Offline Alert*

*节点名称:* ${node.name}
*协议:* ${node.protocol}
*地址:* ${node.address}:${node.port}
*检测时间:* ${new Date(status.lastCheck).toLocaleString('zh-CN')}
*错误:* ${status.error || 'Connection timeout'}
      `.trim();

      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
      
      await axios.post(url, {
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: 'Markdown'
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

module.exports = new NotificationService();
