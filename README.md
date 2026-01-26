# Node Watcher

V2Board 节点监控系统 - 自动拉取订阅并持续监控节点健康状态，支持多种通知方式。

V2Board Node Monitoring System - Automatically fetch subscriptions and continuously monitor node health with multiple notification methods.

## ✨ 功能特性 / Features

- 🔄 **自动订阅拉取** - 支持 V2Board 订阅格式，自动解析节点
- ➕ **手动添加节点** - 支持手动添加单个节点进行监控
- 🌐 **自定义测活网址** - 可配置通过访问指定URL来检测节点连通性
- 📊 **实时监控** - 持续监控节点在线状态和响应时间
- 📈 **在线率统计** - 24小时/7天/30天在线率统计，访客可查看
- 🔔 **多种通知方式** - 支持 Bark、Email、Telegram 三种通知方式
- 🌐 **Web 控制面板** - 简洁美观的 Web 界面，方便管理
- 🐳 **多种部署方式** - 支持直接部署和 Docker 部署
- 🔐 **支持多种协议** - VMess、VLESS (含 Reality)、Trojan、Shadowsocks

## 🚀 快速开始 / Quick Start

### 方式一：直接部署 / Direct Deployment

#### 1. 克隆项目 / Clone Repository

```bash
git clone https://github.com/leoch627/node-watcher.git
cd node-watcher
```

#### 2. 安装依赖 / Install Dependencies

```bash
npm install
```

#### 3. 配置环境变量 / Configure Environment

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

#### 4. 启动应用 / Start Application

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

#### 5. 使用 PM2 守护进程（推荐） / PM2 Daemon (Recommended)

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start src/index.js --name node-watcher

# 查看状态
pm2 status

# 查看日志
pm2 logs node-watcher

# 停止应用
pm2 stop node-watcher

# 重启应用
pm2 restart node-watcher

# 设置开机自启
pm2 startup
pm2 save
```

### 方式二：Docker 部署 / Docker Deployment

#### 1. 使用 Docker Compose（推荐）/ Using Docker Compose (Recommended)

```bash
# 克隆项目
git clone https://github.com/leoch627/node-watcher.git
cd node-watcher

# 编辑配置文件
nano config.json

# 启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止容器
docker-compose down
```

#### 2. 使用 Docker 命令 / Using Docker Commands

```bash
# 构建镜像
docker build -t node-watcher .

# 运行容器
docker run -d \
  --name node-watcher \
  -p 3000:3000 \
  -v $(pwd)/config.json:/app/config.json \
  -v $(pwd)/logs:/app/logs \
  node-watcher

# 查看日志
docker logs -f node-watcher

# 停止容器
docker stop node-watcher
```

## 📖 使用说明 / Usage Guide

### 访问 Web 面板 / Access Web Panel

启动后访问：`http://localhost:3000`

- 📊 **监控面板** - 查看所有节点状态和在线率
- 📡 **订阅管理** - 添加/删除 V2Board 订阅
- ➕ **手动节点** - 手动添加单个节点进行监控
- 🔔 **通知设置** - 配置 Bark/Email/Telegram 通知
- ⚙️ **系统设置** - 调整检测间隔、超时时间和自定义测活URL

### 公开访问接口 / Public API

访客可以通过以下接口查看节点在线率（不需要认证）：

```
GET http://localhost:3000/api/nodes/public
```

返回格式：
```json
{
  "success": true,
  "stats": [
    {
      "name": "节点名称",
      "protocol": "vmess",
      "online": true,
      "lastCheck": "2024-01-01T00:00:00.000Z",
      "responseTime": 123,
      "uptime": {
        "24h": {
          "uptimePercentage": 99.5,
          "totalChecks": 288,
          "onlineChecks": 287,
          "offlineChecks": 1
        },
        "7d": { ... },
        "30d": { ... }
      }
    }
  ],
  "summary": {
    "total": 10,
    "online": 8,
    "offline": 2
  }
}
```

## ⚙️ 配置说明 / Configuration

### 环境变量 / Environment Variables

在 `.env` 文件中配置：

```env
# 服务器配置
PORT=3000                           # 服务端口
NODE_ENV=production                 # 运行环境

# 监控配置
CHECK_INTERVAL_MINUTES=5            # 检测间隔（分钟）
TIMEOUT_SECONDS=10                  # 超时时间（秒）
CUSTOM_HEALTH_CHECK_URL=            # 自定义测活URL（可选）

# Bark 通知（iOS）
BARK_ENABLED=false                  # 是否启用
BARK_URL=                           # Bark 推送地址

# 邮件通知
EMAIL_ENABLED=false                 # 是否启用
EMAIL_HOST=smtp.gmail.com          # SMTP 服务器
EMAIL_PORT=587                     # SMTP 端口
EMAIL_USER=                        # 邮箱账号
EMAIL_PASSWORD=                    # 邮箱密码（应用专用密码）
EMAIL_FROM=                        # 发件人
EMAIL_TO=                          # 收件人

# Telegram 通知
TELEGRAM_ENABLED=false             # 是否启用
TELEGRAM_BOT_TOKEN=                # Bot Token
TELEGRAM_CHAT_ID=                  # Chat ID
```

### 配置文件 / Config File

也可以直接编辑 `config.json`：

```json
{
  "server": {
    "port": 3000
  },
  "monitoring": {
    "checkIntervalMinutes": 5,
    "timeoutSeconds": 10,
    "retryAttempts": 3,
    "customHealthCheckUrl": "https://www.google.com"
  },
  "subscriptions": [
    {
      "id": "1234567890",
      "name": "我的订阅",
      "url": "https://example.com/api/v1/client/subscribe?token=xxx",
      "enabled": true,
      "addedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "manualNodes": [
    {
      "id": "0987654321",
      "name": "香港节点 01",
      "protocol": "vmess",
      "address": "hk01.example.com",
      "port": 443,
      "enabled": true,
      "addedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "notifications": {
    "bark": {
      "enabled": false,
      "url": "https://api.day.app/YOUR_KEY"
    },
    "email": {
      "enabled": false,
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "your-email@gmail.com",
        "pass": "your-app-password"
      },
      "from": "sender@example.com",
      "to": "receiver@example.com"
    },
    "telegram": {
      "enabled": false,
      "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "chatId": "123456789"
    }
  }
}
```

## 🔔 通知设置指南 / Notification Setup Guide

### Bark（iOS）

1. 在 App Store 下载 Bark 应用
2. 打开应用获取推送 URL
3. 在 Web 面板中配置 Bark URL
4. 点击"测试"按钮验证配置

### Email

1. 使用支持 SMTP 的邮箱（如 Gmail）
2. 生成应用专用密码（不是登录密码）
   - Gmail: https://myaccount.google.com/apppasswords
3. 在 Web 面板中配置 SMTP 信息
4. 点击"测试"按钮验证配置

### Telegram

1. 在 Telegram 中搜索 @BotFather
2. 发送 `/newbot` 创建机器人，获取 Bot Token
3. 搜索 @userinfobot 获取你的 Chat ID
4. 在 Web 面板中配置 Token 和 Chat ID
5. 点击"测试"按钮验证配置

## 🛠️ API 接口 / API Endpoints

### 节点相关 / Nodes

- `GET /api/nodes` - 获取所有节点状态（需认证）
- `GET /api/nodes/public` - 获取公开节点统计（无需认证）
- `POST /api/nodes/check` - 手动触发健康检查
- `POST /api/nodes/reload` - 重新加载订阅

### 订阅管理 / Subscriptions

- `GET /api/subscriptions` - 获取订阅列表
- `POST /api/subscriptions` - 添加订阅
- `DELETE /api/subscriptions/:id` - 删除订阅

### 手动节点 / Manual Nodes

- `GET /api/manual-nodes` - 获取手动节点列表
- `POST /api/manual-nodes` - 添加手动节点
- `PUT /api/manual-nodes/:id` - 更新手动节点
- `DELETE /api/manual-nodes/:id` - 删除手动节点

### 通知设置 / Notifications

- `GET /api/notifications` - 获取通知配置
- `PUT /api/notifications/:type` - 更新通知配置
- `POST /api/notifications/test/:type` - 测试通知

### 系统设置 / System

- `GET /api/system/status` - 获取系统状态
- `GET /api/system/config` - 获取系统配置
- `PUT /api/system/monitoring` - 更新监控配置

## 📋 支持的协议 / Supported Protocols

- ✅ VMess
- ✅ VLESS (包括 VLESS+Reality)
- ✅ Trojan
- ✅ Shadowsocks

### VLESS+Reality 支持

完整支持 VLESS+Reality 协议，包括以下参数：
- `pbk` - Public Key（公钥）
- `sid` - Short ID（短ID）
- `sni` - Server Name（服务器名称）
- `fp` - Fingerprint（指纹）
- `spx` - Spider X

## 🔍 监控原理 / Monitoring Principle

1. 定期从 V2Board 订阅链接拉取节点信息
2. 支持手动添加单个节点进行监控
3. 通过 TCP 连接测试节点可用性（默认）
4. 可配置自定义测活URL，通过访问指定网址来检测连通性
5. 记录节点状态和响应时间
6. 计算不同时间段的在线率（24h/7d/30d）
7. 节点状态变化时发送通知

### 测活方式 / Health Check Methods

#### 默认模式 - TCP 连接检测
直接尝试连接节点的 IP:Port，成功连接即视为在线。

#### 自定义URL模式 - HTTP 访问检测
配置自定义测活URL后（如 `https://www.google.com`），系统会通过代理访问该URL来判断节点是否可用。这种方式更接近真实使用场景。

**配置方法**：
在系统设置中填入"自定义测活网址"，例如：
- `https://www.google.com`
- `https://www.cloudflare.com`
- `http://www.gstatic.com/generate_204`

## 📊 数据持久化 / Data Persistence

- 配置数据存储在 `config.json`
- 日志文件存储在 `logs/` 目录
- 节点历史数据保留最近 1000 次检测记录

## 🔒 安全建议 / Security Recommendations

1. ⚠️ 不要将 `config.json` 和 `.env` 提交到公开仓库
2. 🔐 使用应用专用密码而非账户主密码
3. 🌐 建议在内网或 VPN 环境下使用
4. 🔑 定期更换 API Token 和密码
5. 🛡️ 使用 Nginx 反向代理并启用 HTTPS

## 🤝 贡献 / Contributing

欢迎提交 Issue 和 Pull Request！

## 📄 许可证 / License

MIT License

## 🙏 致谢 / Acknowledgments

感谢所有开源项目的贡献者！

---

**注意 / Note**: 本项目仅供学习交流使用，请遵守当地法律法规。
This project is for learning and communication purposes only. Please comply with local laws and regulations.