# Node Watcher

面向代理节点运维的多订阅检测面板。使用 Mihomo 执行真实代理连通性测试，并按节点检测流媒体可用性，支持生成可分享的 PNG 矩阵报告。

## 功能

- 同时拉取多个订阅；单个来源失败不会影响其他来源
- 支持 Clash YAML、Base64 通用订阅
- 支持 `vmess://`、`vless://`、`trojan://`、`ss://`、`hysteria2://`、`hy2://`、`tuic://` 批量导入
- 为跨订阅重名节点生成稳定 ID，不再互相覆盖
- Mihomo 并发延迟检测，保留 24 小时、7 天、30 天在线率
- Netflix、Disney+、YouTube Premium、Prime Video、ChatGPT 出口检测
- miaospeed 风格 PNG 结果矩阵
- React、Tailwind CSS、shadcn/ui 操作台
- `linux/amd64` 与 `linux/arm64` Docker 镜像

## Docker 部署

```bash
git clone https://github.com/leoch627/node-watcher.git
cd node-watcher
docker compose up -d --build
```

访问 `http://localhost:3000`。配置和历史记录保存在 `./data`，日志保存在 `./logs`。

Dockerfile 使用 BuildKit 的 `TARGETARCH` 自动下载对应的 Mihomo `v1.19.30` 二进制。仓库中的工作流会发布同时包含 `linux/amd64`、`linux/arm64` 的 GHCR manifest。

手动构建双架构镜像：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-name/node-watcher:latest \
  --push .
```

## 本地开发

需要 Node.js 22+ 和可执行的 Mihomo：

```bash
npm ci
npm run build
npm start
```

前后端分别开发时：

```bash
# 终端 1
npm start

# 终端 2，Vite 会把 /api 转发到 3000
npm run dev:web
```

常用命令：

```bash
npm test
npm run build
npm audit --omit=dev
```

## 使用

1. 在“来源”中添加多个订阅，或粘贴通用节点链接批量导入。
2. 点击“检测延迟”刷新节点连通性。
3. 不选择节点时，“流媒体检测”检测全部节点；勾选后只检测所选节点。
4. 在“报告”中预览或下载最新 PNG。

流媒体任务按节点串行切换 Mihomo 出口，每个节点内部并行检测平台，避免并发切换导致结果串线。Disney+ 和 Prime Video 的未登录检测只能判断区域落地页可用性；平台策略变化时结果可能存在偏差。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/nodes/public` | 节点状态、在线率和流媒体结果 |
| `POST` | `/api/nodes/check` | 执行连通性检测 |
| `POST` | `/api/nodes/media-check` | 创建流媒体检测任务 |
| `GET` | `/api/nodes/jobs` | 获取任务进度 |
| `GET` | `/api/reports/latest.png` | 最新 PNG 报告 |
| `POST` | `/api/imports/preview` | 预检通用节点内容 |

## 配置

主要环境变量见 [`.env.example`](.env.example)。Docker 默认将配置写入 `/app/data/config.json`；本地运行继续兼容项目根目录的 `config.json`。

管理 API 目前不内置用户系统。部署到公网时，应通过反向代理增加认证并限制访问；订阅地址和节点凭据属于敏感数据，不要提交 `config.json` 或 `data/`。

## 参考与许可

项目参考了以下工具的产品形态和检测思路，没有复制其实现代码：

- [koipy-org/FullTclash](https://github.com/koipy-org/FullTclash)
- [lmc999/RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck)
- [miaokobot/miaospeed](https://github.com/miaokobot/miaospeed)

本项目保持 MIT License。上述项目有各自的许可证，使用和分发时请分别遵守。
