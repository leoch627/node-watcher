const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../utils/config');

const MAX_LISTED_NODES = 15;

function clip(value, length) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

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
        logger.error(`Error initializing email transporter: ${error.message}`);
      }
    }
  }

  async sendNotification(node, status) {
    if (!status.statusChanged) return [];
    return this.dispatchAlert(this.getAlert(node, status), node.name);
  }

  // Sends one alert to every enabled channel concurrently. Channel senders never reject.
  async dispatchAlert(alert, label) {
    const notifications = this.config.getConfig().notifications;
    const tasks = [];
    if (notifications.bark.enabled) tasks.push(this.pushBark(alert, label));
    if (notifications.email.enabled) tasks.push(this.pushEmail(alert, label));
    if (notifications.telegram.enabled) tasks.push(this.pushTelegram(alert, label));
    return Promise.all(tasks);
  }

  // One message for several nodes that changed state in the same check cycle.
  async sendBatchNotification(kind, entries) {
    if (!entries.length) return [];
    return this.dispatchAlert(this.getBatchAlert(kind, entries), `${entries.length} nodes`);
  }

  // Sent instead of per-node alerts when (almost) every node fails at once: that points at the
  // monitoring host's own network or at Mihomo, not at the nodes.
  async sendIncidentNotification({ failing, total }, resolved = false) {
    return this.dispatchAlert(this.getIncidentAlert({ failing, total }, resolved), 'incident');
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
      subject: `[Node Watcher] ${title} - ${node.name}`,
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

  getBatchAlert(kind, entries) {
    const online = kind === 'recovered';
    const title = `${online ? '节点恢复通知' : '节点离线告警'}（${entries.length} 个节点）`;
    const lines = entries.slice(0, MAX_LISTED_NODES).map(({ node, status }) => {
      const detail = online ? '' : ` — ${clip(status?.error || '连接超时', 60)}`;
      return `${online ? '🟢' : '🔴'} ${node.name} (${node.server || node.address || '-'}:${node.port || '-'})${detail}`;
    });
    if (entries.length > MAX_LISTED_NODES) lines.push(`…另有 ${entries.length - MAX_LISTED_NODES} 个节点`);
    const checkedAt = new Date().toLocaleString('zh-CN', { hour12: false });
    return {
      online,
      title,
      subject: `[Node Watcher] ${title}`,
      message: [...lines, `检测时间: ${checkedAt}`].join('\n')
    };
  }

  getIncidentAlert({ failing, total }, resolved) {
    const title = resolved ? '检测已恢复正常' : '大量节点同时检测失败';
    const message = resolved
      ? `失败节点已降至 ${failing}/${total}，逐节点告警恢复。`
      : `${failing}/${total} 个节点同时检测失败，更可能是监控主机网络或 Mihomo 异常而非节点本身故障，已暂停逐节点告警。`;
    return { online: resolved, title, subject: `[Node Watcher] ${title}`, message };
  }

  async pushBark(alert, label) {
    try {
      const barkConfig = this.config.getConfig().notifications.bark;

      if (!barkConfig.url) {
        throw new Error('Bark URL not configured');
      }

      const baseUrl = barkConfig.url.replace(/\/$/, '');
      const url = `${baseUrl}/${encodeURIComponent(alert.title)}/${encodeURIComponent(clip(alert.message, 800))}`;
      await this.http.get(url, { timeout: 10000, params: { group: 'Node Watcher' } });

      logger.info(`Bark notification sent: ${label}`);
      return { service: 'bark', success: true };
    } catch (error) {
      logger.error(`Error sending Bark notification (${label}): ${error.message}`);
      return { service: 'bark', success: false, error: error.message };
    }
  }

  async pushEmail(alert, label) {
    try {
      const emailConfig = this.config.getConfig().notifications.email;

      if (!this.emailTransporter) {
        this.initEmailTransporter();
      }

      if (!this.emailTransporter) {
        throw new Error('Email transporter not initialized');
      }

      const color = alert.online ? '#047857' : '#b91c1c';
      const mailOptions = {
        from: emailConfig.from,
        to: emailConfig.to,
        subject: alert.subject || `[Node Watcher] ${alert.title}`,
        html: `
          <h2 style="color:${color}">${escapeHtml(alert.title)}</h2>
          ${alert.message.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          <hr>
          <p style="color:#666;font-size:12px">Node Watcher 自动通知</p>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);

      logger.info(`Email notification sent: ${label}`);
      return { service: 'email', success: true };
    } catch (error) {
      logger.error(`Error sending email notification (${label}): ${error.message}`);
      return { service: 'email', success: false, error: error.message };
    }
  }

  async pushTelegram(alert, label) {
    try {
      const telegramConfig = this.config.getConfig().notifications.telegram;

      if (!telegramConfig.botToken || !telegramConfig.chatId) {
        throw new Error('Telegram bot token or chat ID not configured');
      }

      const message = clip(
        `<b>${alert.online ? '🟢' : '🔴'} ${escapeHtml(alert.title)}</b>\n\n${escapeHtml(alert.message)}`, 3900
      );

      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

      await this.http.post(url, {
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: 'HTML'
      }, { timeout: 10000 });

      logger.info(`Telegram notification sent: ${label}`);
      return { service: 'telegram', success: true };
    } catch (error) {
      logger.error(`Error sending Telegram notification (${label}): ${error.message}`);
      return { service: 'telegram', success: false, error: error.message };
    }
  }

  // Per-node wrappers kept for the existing API and tests.
  async sendBarkNotification(node, status) {
    return this.pushBark(this.getAlert(node, status), node.name);
  }

  async sendEmailNotification(node, status) {
    return this.pushEmail(this.getAlert(node, status), node.name);
  }

  async sendTelegramNotification(node, status) {
    return this.pushTelegram(this.getAlert(node, status), node.name);
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
