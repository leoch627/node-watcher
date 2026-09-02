# Node Watcher

Node Watcher 是一个自托管的代理节点监控面板。它通过 Mihomo 逐个切换代理出口，检测节点连通性、延迟和常见流媒体/AI 服务可用性，并在节点离线或恢复时发送告警。

## 功能

- 多订阅独立拉取，单个来源失败不影响其他来源
- 支持 Clash YAML、Base64 通用订阅和节点链接批量导入
- 支持 VMess、VLESS、Trojan、Shadowsocks、Hysteria2、TUIC
- 节点首次加载显示为“待检测”，避免误报离线
- 记录 24 小时、7 天、30 天在线率和响应时间
- 检测 Netflix、Disney+、YouTube Premium、Prime Video、ChatGPT
- 节点离线与恢复时发送 Bark、邮件或 Telegram Bot 告警
- 生成可下载的 PNG 检测矩阵
- 管理员登录、签名会话 Cookie 和登录失败限速
- Dockerfile 支持 `linux/amd64` 和 `linux/arm64` 构建（GitHub Actions 当前仅发布 `linux/amd64`）

## 树莓派部署

建议使用 64 位 Raspberry Pi OS。运行 `uname -m` 应显示 `aarch64`。

```bash
git clone https://github.com/leoch627/node-watcher.git
cd node-watcher
cp .env.example .env
mkdir -p data logs
```

编辑 `.env`，至少替换下面两项：

```dotenv
AUTH_PASSWORD=换成你的强密码
AUTH_SESSION_SECRET=换成至少32字节的随机字符串
```

随机会话密钥可以用 `openssl rand -hex 32` 生成。然后启动：

```bash
docker compose up -d --build
docker compose ps
```

浏览器访问 `http://树莓派IP:3000`，默认用户名为 `admin`，密码是 `.env` 中的 `AUTH_PASSWORD`。

查看日志和更新：

```bash
docker compose logs -f --tail=100
git pull
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

配置、检测历史和告警密钥位于 `./data`，日志位于 `./logs`。备份时保留这两个目录；不要将 `.env`、`data/` 或订阅地址提交到 Git。

## 多架构镜像

`Dockerfile` 会根据构建目标自动下载对应的 Mihomo 二进制；普通 Raspberry Pi 64 位系统会构建 `arm64` 版本。GitHub Actions 当前发布的镜像 manifest 包含：

- `linux/amd64`

手动发布双架构镜像：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-name/node-watcher:latest \
  --push .
```

## 登录与公网访问

生产模式下未设置 `AUTH_PASSWORD` 时，服务会拒绝启动。除 `/api/health` 和 `/api/auth/*` 外，全部 API 和报告下载都需要登录。

会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。直接通过局域网 HTTP 访问时保持：

```dotenv
AUTH_COOKIE_SECURE=false
TRUST_PROXY=0
```

通过 HTTPS 反向代理部署时改为：

```dotenv
AUTH_COOKIE_SECURE=true
TRUST_PROXY=1
```

公网部署还应在路由器、防火墙或反向代理处限制访问来源。应用内配置的 SMTP 密码、Bot Token 和订阅凭据保存在本机数据目录，请保护其文件权限。

## 告警配置

登录后进入“设置 > 状态告警”，可以单独启用并测试：

- Bark：填写完整推送地址，例如 `https://api.day.app/你的Key`
- 邮件：填写 SMTP 地址、端口、账号、应用专用密码、发件人和收件人
- Telegram：填写 Bot Token 和 Chat ID

节点第一次检测只建立状态基线，不发送告警。之后从在线变为离线时告警，从离线恢复在线时发送恢复通知；状态不变不会重复发送。

## 节点与媒体检测

在“来源”中添加订阅或手动导入节点，然后点击“重新拉取来源”。“检测延迟”执行连通性检测；“流媒体检测”在未勾选节点时检测全部节点，勾选后只检测所选节点。

流媒体任务按节点串行切换 Mihomo 出口，每个节点内部并行请求平台，避免不同节点的结果串线。检测依赖平台公开页面和接口的当前行为，平台改版、风控或验证码都可能使结果暂时显示为错误。

## 本地开发

需要 Node.js 22+ 和可执行的 Mihomo：

```bash
npm ci
AUTH_PASSWORD=dev-password npm start
```

前端开发服务器会将 `/api` 转发到后端：

```bash
npm run dev:web
```

验证命令：

```bash
npm test
npm run build
npm audit --omit=dev
```

## 环境变量

完整示例见 [`.env.example`](.env.example)。常用配置如下：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Web 服务端口 |
| `AUTH_USERNAME` | `admin` | 登录用户名 |
| `AUTH_PASSWORD` | 无 | 生产环境必填；也可使用 `AUTH_PASSWORD_FILE` |
| `AUTH_SESSION_SECRET` | 登录密码 | 会话签名密钥，建议单独随机生成 |
| `AUTH_SESSION_TTL_HOURS` | `24` | 会话有效时间 |
| `AUTH_COOKIE_SECURE` | `false` | 仅 HTTPS 部署设为 `true` |
| `TRUST_PROXY` | `0` | 单层可信反向代理后设为 `1` |
| `MIHOMO_HTTP_PORT` | `23333` | Mihomo HTTP 代理端口 |
| `MIHOMO_SOCKS_PORT` | `23334` | Mihomo SOCKS 代理端口 |
| `MIHOMO_CONTROLLER_PORT` | `23335` | Mihomo 控制端口 |
| `CONFIG_FILE` | `./config.json` | 配置文件；容器中为 `/app/data/config.json` |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 无需登录的存活检查 |
| `GET` | `/api/auth/session` | 当前登录状态 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 退出 |
| `GET` | `/api/nodes/public` | 节点状态、在线率和检测结果 |
| `POST` | `/api/nodes/check` | 执行连通性检测 |
| `POST` | `/api/nodes/media-check` | 创建流媒体检测任务 |
| `GET` | `/api/reports/latest.png` | 最新 PNG 报告 |

除健康检查和鉴权接口外，其余 API 都需要有效会话 Cookie。

## 许可证与来源

本项目采用 [GNU Affero General Public License v3.0](LICENSE)。通过网络向用户提供修改后的版本时，也需要向这些用户提供对应源代码。

`src/services/media.js` 的部分检测判定改写自 [lmc999/RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck)。具体范围和上游版本指纹见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。其余参考项目仍遵循各自许可证。
