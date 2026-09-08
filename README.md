# Node Watcher

自托管的代理节点监控面板，集中查看多订阅节点的连通性、延迟、在线率，以及流媒体和 AI 服务可用性。

Node Watcher 使用 Mihomo 执行代理检测，提供 Web 管理界面、状态变化告警和 PNG 报告。适合部署在家用服务器、NAS 或 64 位树莓派上。

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 多来源管理 | 独立拉取多个订阅，单个来源失败不会阻断其他来源；支持导入预检 |
| 节点导入 | 支持 Clash YAML、Base64 通用订阅和节点链接，覆盖 VMess、VLESS、Trojan、Shadowsocks、Hysteria2 / Hy2、TUIC |
| 连通性监控 | 定时检测节点状态与延迟，可设置检测周期、超时和并发数；新节点显示为「待检测」 |
| 在线率统计 | 按检测记录计算最近 24 小时、7 天、30 天在线率 |
| 服务可用性 | 手动检测 Netflix、Disney+、YouTube Premium、Prime Video、ChatGPT，并展示出口信息 |
| 状态告警 | 支持 Bark、SMTP 邮件和 Telegram Bot，可分别启用和测试 |
| 检测报告 | 将当前节点状态和服务检测结果生成 PNG 矩阵，可预览、下载 |
| 登录保护 | 管理员登录、签名会话 Cookie、登录失败限速 |

## 快速开始

### 一键部署（推荐）

复制以下一行即可部署，无需克隆仓库或预先安装 Node.js、Docker、Compose。使用 root 运行；普通用户下载后运行脚本时会自动调用 sudo：

```bash
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh
```

只有 curl 时也可以直接复制运行：

```bash
curl -fL https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh -o node-watcher.sh && bash node-watcher.sh
```

默认部署到 **`/opt/node-watcher`**，首次在 **1000–10000** 中随机选择未占用的 TCP 端口；用户名为 `admin`，密码自动生成，安装完成后显示访问地址和密码。

**自定义目录、端口、账号、密码：** 下载命令后面直接追加参数即可。支持命名参数和按顺序传入的位置参数，两种形式任选其一：

```bash
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh -d /opt/node-watcher -p 8080 -u admin -P 'My$Password!'

bash node-watcher.sh /srv/node-watcher 8080 owner 'My$Password!'
```

| 参数 | 含义 | 首次默认值 |
| --- | --- | --- |
| `-d, --dir` | 部署目录，可包含空格，需要加引号 | `/opt/node-watcher` |
| `-p, --port` | 对外 TCP 端口，接受 1–65535 | 随机 1000–10000 |
| `-u, --username` | 登录用户名 | `admin` |
| `-P, --password` | 登录密码 | 36 位随机十六进制密码 |
| `--no-install` | 禁止自动安装依赖，适合已配置 Docker 的 NAS | 默认自动安装 |
| `-h, --help` | 查看用法 | — |

也支持 `--port=8080` 形式，以及 `bash node-watcher.sh install ...` / `bash node-watcher.sh update ...`。不带子命令直接安装或更新，不需要回答交互式问题。密码含 `$`、空格等字符时请用 shell 单引号包裹；命令行密码可能进入 shell 历史，不传 `-P` 可使用随机密码。已克隆仓库时，直接运行 `bash node-watcher.sh` 即可。

### 默认国内加速

脚本按国内服务器环境配置以下下载路径：

| 用途 | 默认地址 |
| --- | --- |
| GitHub 脚本、Compose 二进制及 SHA256 文件 | 原始 GitHub URL 前加 `https://ghfast.top/` |
| Docker CE 软件包安装源 | `https://mirrors.tuna.tsinghua.edu.cn/docker-ce` |
| Docker Hub 镜像加速 | 毫秒镜像 `https://docker.1ms.run` |
| Node Watcher 预编译镜像 | `ghcr.1ms.run/leoch627/node-watcher:latest` |

Docker CE 安装脚本本身也通过 ghfast.top 下载，执行时按 [清华 TUNA 文档](https://mirrors.tuna.tsinghua.edu.cn/help/docker-ce/) 设置 `DOWNLOAD_URL`。清华源用于新安装的 Docker CE 软件包；已有 Docker 会直接复用，Alpine、Arch、openSUSE 分支继续使用系统配置的软件仓库，不修改系统全局软件源。

脚本通过 jq 合并 `/etc/docker/daemon.json`，将毫秒镜像设为首选并保留原有镜像源、数据目录和网络等设置。修改前校验 JSON，有 dockerd 时额外校验 Docker 配置；已有文件会备份为同目录的 `daemon.json.node-watcher-backup.*`。尝试热加载并通过 `docker info` 检查生效情况，不重启 Docker；若 NAS 不支持热加载，会明确提示配置尚未加载，仍可继续通过 GHCR 加速地址部署本项目。厂商使用不同配置路径时，可通过 `NODE_WATCHER_DOCKER_CONFIG=/实际路径/daemon.json bash node-watcher.sh` 指定；该路径必须与 Docker 守护进程实际使用的路径一致。

`registry-mirrors` 只处理 Docker Hub；根据 [毫秒镜像文档](https://mdoc.cc/mliev/1ms/v1.0.0/3)，GHCR 必须将 `ghcr.io` 替换为 `ghcr.1ms.run`。脚本会迁移旧的默认 `ghcr.io/leoch627/node-watcher:latest`，保留自定义镜像及固定版本。需要切换版本时，在部署目录 `.env` 中设置例如 `NODE_WATCHER_IMAGE=ghcr.1ms.run/leoch627/node-watcher:v2.0.0`（标签须已发布）。若加速站限流或不可用，可修改此项后重试。

### 系统与设备适配

| 环境 | 处理方式 |
| --- | --- |
| x86_64 / AMD64 服务器、小主机、NAS | 自动选择 AMD64 镜像 |
| ARM64 / aarch64 服务器、NAS、64 位树莓派 | 自动选择 ARM64 镜像 |
| Debian / Ubuntu、Docker 官方安装脚本支持的 RPM 发行版 | 缺少 Docker 时通过 ghfast.top 下载官方安装脚本，从清华源安装 Docker CE；兼容 apt / dnf / yum 安装基础依赖 |
| Alpine | 使用 apk 安装 Docker；纯净系统先运行 `apk add --no-cache bash wget ca-certificates` |
| Arch / openSUSE | 使用 pacman / zypper 安装发行版提供的 Docker 与 Compose |
| 已有 Docker 的 NAS | 复用本机 Docker；支持 `docker compose` 和独立 `docker-compose` v2+ |
| systemd / OpenRC / SysV 服务环境 | Docker 未启动时自动尝试启动，并等待服务就绪 |

需要 Linux、Bash 和本机 rootful Docker。32 位 ARM、32 位 x86、MIPS 暂无可用镜像；树莓派请使用 64 位系统。NAS 的 Docker 服务若由厂商管理，请先在软件中心启动 Docker / Container Manager。rootless / userns 映射及远程 Docker 主机请使用手动部署。系统自动安装能力受发行版版本和软件源支持范围限制；发行版及 Compose 安装方式参考 [Docker 官方安装文档](https://docs.docker.com/engine/install/) 和 [Compose 安装文档](https://docs.docker.com/compose/install/linux/)。

脚本会自动完成：

- 检测架构、安装缺少的依赖（包括 OpenSSL、jq）并启动 Docker；缺少 Compose 时通过 ghfast.top 下载匹配架构的官方二进制并校验 SHA256。
- 合并 Docker Hub 毫秒镜像配置，并通过 `ghcr.1ms.run` 拉取默认项目镜像。
- 拉取 AMD64 / ARM64 预编译镜像，无需在树莓派上编译。兼容不支持 `--wait` 的较早 Compose v2，通过容器健康状态确认启动结果。
- 选择未占用的随机端口，或使用传入的端口；后续运行保留已选端口。
- 创建 `.env`，默认用户名为 `admin`，生成 **36 位随机十六进制密码**，并分别生成独立的会话密钥和 Mihomo 控制密钥。
- 为 `.env` 设置 `600` 权限，准备 `data/`、`logs/` 并设置容器用户的写入权限；启用 SELinux 的 Docker 自动使用 `:Z` 挂载标签。
- 生成专用的 `compose.deploy.yml`，保留原有 `docker-compose.yml`，启动容器并等待健康检查。
- 成功后显示访问地址、首次生成的密码及日志查看命令。只有显式传入的参数会覆盖对应设置，其他已有非空设置保留，空白或缺失项自动补全。

密码和密钥保存在目标机器的 `.env` 中，不会写入仓库。首次拉取失败时也会保留生成的配置，修复问题后可直接重试。若需要公网访问，请将显示的本机地址替换成服务器公网地址，并在防火墙和云安全组中放行显示的 TCP 端口。

**更新或修改设置：** 默认目录直接重新运行 `bash node-watcher.sh`。自定义目录每次传入相同的 `--dir`，例如 `bash node-watcher.sh --dir /srv/node-watcher --port 9090` 只修改端口，保留密码和数据。也可编辑部署目录的 `.env` 后重新运行脚本；设置 `NODE_WATCHER_IMAGE` 可固定已发布的镜像标签。`compose.deploy.yml` 由脚本管理，每次运行会重新生成，请勿在其中保存自定义修改。更换目录表示使用另一份配置和数据，不会自动迁移旧目录。

一键部署后的手动维护命令需要明确使用专用 Compose 文件：

```bash
cd /opt/node-watcher
docker compose --project-name node-watcher --env-file .env -f compose.deploy.yml logs -f --tail=100
docker compose --project-name node-watcher --env-file .env -f compose.deploy.yml ps
```

### 手动部署预编译镜像

无需克隆源码或本地构建，只需安装 Docker 和 Docker Compose。仓库的 GitHub Actions 会在推送 `main` 分支或 `v*` 标签后构建镜像，成功后发布到 GHCR；日常部署使用：

```text
ghcr.io/leoch627/node-watcher:latest
```

镜像包含前端、后端和 Mihomo。发布流程分别构建 `linux/amd64` 与 `linux/arm64`，再合并为同一个多架构镜像标签，适用于 x86_64 服务器、NAS 和 64 位树莓派。Docker 会自动选择匹配宿主机架构的镜像，无需手动指定 `platform`。

> 旧版发布流程曾只提供 AMD64 镜像。ARM64 设备首次部署前，请确认新版工作流的 `Build amd64`、`Build arm64` 和 `Publish multi-platform image` 均已成功；仅推送代码或完成单个架构构建还不代表镜像标签已更新。

**1. 创建部署目录**

```bash
mkdir -p node-watcher/data node-watcher/logs
cd node-watcher
```

**2. 创建 `.env` 文件**

填入自己的强密码和独立的随机会话密钥：

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=替换为强密码
AUTH_SESSION_SECRET=替换为随机密钥
AUTH_COOKIE_SECURE=false
TRUST_PROXY=0
```

使用 `openssl rand -hex 32` 生成随机密钥，将输出填入 `AUTH_SESSION_SECRET`。

**3. 创建 `docker-compose.yml` 文件**

```yaml
services:
  node-watcher:
    image: ghcr.io/leoch627/node-watcher:latest
    container_name: node-watcher
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      NODE_ENV: production
      PORT: 3000
      AUTH_USERNAME: ${AUTH_USERNAME:-admin}
      AUTH_PASSWORD: ${AUTH_PASSWORD:?Set AUTH_PASSWORD in .env}
      AUTH_SESSION_SECRET: ${AUTH_SESSION_SECRET:-}
      AUTH_SESSION_TTL_HOURS: ${AUTH_SESSION_TTL_HOURS:-24}
      AUTH_COOKIE_SECURE: ${AUTH_COOKIE_SECURE:-false}
      TRUST_PROXY: ${TRUST_PROXY:-0}
      MIHOMO_HTTP_PORT: ${MIHOMO_HTTP_PORT:-23333}
      MIHOMO_SOCKS_PORT: ${MIHOMO_SOCKS_PORT:-23334}
      MIHOMO_CONTROLLER_PORT: ${MIHOMO_CONTROLLER_PORT:-23335}
      MIHOMO_SECRET: ${MIHOMO_SECRET:-node-watcher-secret}
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
```

镜像以非 root 的 `node` 用户运行。Linux 宿主机需确保挂载的 `data/`、`logs/` 可由容器用户（UID/GID `1000:1000`）写入；若出现权限错误，可在上述部署目录中执行 `sudo chown -R 1000:1000 data logs`。使用 rootless Docker 或用户命名空间映射时，请按实际映射调整权限。

**4. 拉取并启动**

```bash
docker compose pull
docker compose up -d
docker compose ps
```

浏览器访问 `http://服务器IP:3000`，使用 `.env` 中配置的账号和密码登录。此方式不需要执行 `git pull`、`npm install` 或 `docker compose build`。

> 请等待 GitHub Actions 构建发布成功后再拉取。`latest` 用于跟随默认分支构建；如需固定版本，可将镜像标签替换为已发布的 `v*` 标签。自动发布镜像不会自动更新已运行的容器，更新命令见「数据与维护」。

如需修改对外端口，将端口映射改为例如 `"8080:3000"`，然后访问 `http://服务器IP:8080`。仅修改 `.env` 中的 `PORT` 不会改变此 Compose 的端口配置。

### 从源码构建（可选）

准备好 Git、Docker 和 Docker Compose。仓库的 Docker 构建支持 `linux/amd64` 和 `linux/arm64`，镜像内已包含 Mihomo，无需在宿主机另行安装。

树莓派请使用 64 位系统，`uname -m` 应显示 `aarch64`。

```bash
git clone https://github.com/leoch627/node-watcher.git
cd node-watcher
cp .env.example .env
mkdir -p data logs
```

编辑 `.env`，设置登录密码和独立的会话签名密钥：

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=替换为强密码
AUTH_SESSION_SECRET=替换为随机密钥
```

可用以下命令生成随机密钥，再将输出填入 `AUTH_SESSION_SECRET`：

```bash
openssl rand -hex 32
```

启动服务：

```bash
docker compose up -d --build
docker compose ps
```

浏览器访问 `http://服务器IP:3000`，使用 `.env` 中配置的账号和密码登录。

> 仓库自带的 `docker-compose.yml` 从本地源码构建镜像，与上方预编译镜像示例不同。首次构建需要下载 npm 依赖和 Mihomo，当前 Dockerfile 不支持 32 位 ARM。Linux 挂载目录的写入权限要求与预编译镜像相同。

如需修改对外端口，调整 `docker-compose.yml` 中的端口映射，例如 `"8080:3000"`。仅修改 `.env` 中的 `PORT` 不会改变当前 Compose 的端口配置。

### 首次使用

1. 进入「来源」，添加订阅地址，或通过「导入节点」粘贴节点链接 / Clash YAML；导入前可先预检。
2. 使用顶部的「重新拉取来源」刷新节点，并在来源列表检查加载结果。
3. 点击「检测延迟」执行连通性检测；在「设置 > 检测设置」调整周期、超时和并发数。
4. 点击「流媒体检测」检测服务可用性：未勾选节点时检测全部节点，勾选后只检测所选节点。
5. 在「设置 > 状态告警」配置通知渠道，并发送测试通知。
6. 在「报告」中预览当前检测矩阵，点击「下载 PNG」保存。

## 检测与告警机制

### 连通性与在线率

- 启动时加载来源并执行一次连通性检测；之后按配置周期重新拉取来源并检测。
- 默认检测周期为 **5 分钟**，单节点超时为 **10 秒**，并发数为 **8**；并发可设置为 1–32。
- 连通性检测通过 Mihomo 请求 `https://www.gstatic.com/generate_204`，显示的是该请求的延迟，不是 ICMP Ping 或带宽测速结果。
- 在线率为指定时间窗口内「成功检测次数 / 总检测次数」，不是按持续在线时长计算。没有检测记录时不显示在线率。
- 历史记录按节点保留最近 31 天、最多 10,000 条；检测频率较高时，记录数量上限可能使实际覆盖时间短于 30 天。

### 流媒体与 AI 服务

流媒体检测需手动触发，不随定时连通性检测自动执行。任务按节点串行切换 Mihomo 出口，同一节点的各平台请求并行执行，避免不同节点的出口相互干扰。

结果反映检测时平台页面或接口的响应，不保证实际账号登录、订阅、播放或使用体验。平台改版、风控、验证码及网络波动都可能影响判定；连通性正常也不代表某个平台一定可用。

### 状态告警

| 渠道 | 需要填写 |
| --- | --- |
| Bark | 完整推送地址，例如 `https://api.day.app/你的Key` |
| 邮件 | SMTP 主机、端口、TLS 设置、账号、密码、发件人和收件人 |
| Telegram | Bot Token 和 Chat ID |

节点首次检测只建立状态基线，不发送告警。后续从在线变为离线时发送故障通知，从离线变为在线时发送恢复通知，状态不变不会重复通知。

当前节点状态和流媒体结果保存在内存中，重启后需重新检测，首次检测也会重新建立告警基线；在线率历史会从磁盘恢复。

## 配置说明

登录与 Mihomo 启动参数由环境变量控制；订阅、导入内容、检测设置和通知渠道保存在配置文件中，可通过面板管理。

> **配置文件与环境变量不是逐项合并的。** 已有配置文件时，程序直接读取文件。`CHECK_INTERVAL_MINUTES`、`TIMEOUT_SECONDS`、`CHECK_CONCURRENCY` 和通知相关环境变量只用于生成缺省配置。默认 Compose 也未传入这些变量，使用 Docker 部署时请优先在面板中修改检测和通知设置。

### 常用环境变量

基础示例见 [`.env.example`](.env.example)，下表还列出了部分可选覆盖项。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端监听端口；默认 Compose 固定为 `3000` |
| `NODE_ENV` | Compose 中为 `production` | 生产模式必须配置登录密码 |
| `AUTH_USERNAME` | `admin` | 登录用户名 |
| `AUTH_PASSWORD` | 无 | 登录密码；默认 Compose 必填 |
| `AUTH_PASSWORD_FILE` | 无 | 从文件读取密码，优先于 `AUTH_PASSWORD`；容器使用时需自行挂载文件并调整 Compose 环境配置 |
| `AUTH_SESSION_SECRET` | 回退到登录密码 | 会话签名密钥，建议独立随机生成 |
| `AUTH_SESSION_TTL_HOURS` | `24` | 会话有效时间，单位为小时 |
| `AUTH_COOKIE_SECURE` | `false` | HTTPS 部署时设为 `true` |
| `TRUST_PROXY` | `0` | 位于单层可信反向代理后时可设为 `1` |
| `CONFIG_FILE` | 项目根目录的 `config.json` | Docker 镜像中设为 `/app/data/config.json` |
| `MIHOMO_BIN` | 优先使用 `./bin/mihomo`，否则查找 `PATH` | 本地运行时可指定 Mihomo 可执行文件路径 |
| `MIHOMO_HTTP_PORT` | `23333` | Mihomo HTTP 代理端口 |
| `MIHOMO_SOCKS_PORT` | HTTP 端口 + 1 | `.env.example` 和 Compose 中为 `23334` |
| `MIHOMO_CONTROLLER_PORT` | HTTP 端口 + 2 | `.env.example` 和 Compose 中为 `23335` |
| `MIHOMO_SECRET` | `node-watcher-secret` | Mihomo 控制接口密钥 |

### 登录与访问边界

除 `/api/health` 和 `/api/auth/*` 外，其他 API（包括 `/api/nodes/public`）及 PNG 报告接口均要求有效登录会话。会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。

局域网直接使用 HTTP 时保持：

```dotenv
AUTH_COOKIE_SECURE=false
TRUST_PROXY=0
```

通过单层可信 HTTPS 反向代理访问时设置：

```dotenv
AUTH_COOKIE_SECURE=true
TRUST_PROXY=1
```

不要在 HTTP 部署中启用 Secure Cookie，否则登录会话无法正常使用。不要向公网暴露 Mihomo 的代理和控制端口。订阅凭据、SMTP 密码和 Bot Token 会保存在本机文件中，请限制文件访问权限，避免提交 `.env`、数据目录或真实订阅内容。

非生产模式未设置密码时会关闭鉴权；开发环境也应设置密码，尤其是允许其他设备访问时。

## 数据与维护

一键部署、预编译镜像示例与仓库自带的 Docker Compose 均挂载以下目录：

| 宿主机路径 | 内容 |
| --- | --- |
| `data/config.json` | 订阅、导入节点、检测参数、通知配置等 |
| `data/history.json` | 连通性检测历史，用于在线率统计 |
| `data/mihomo/` | 自动生成的 Mihomo 配置及运行数据，包含节点凭据 |
| `logs/` | 应用日志 |
| `.env` | 登录和容器启动配置 |

本地非 Docker 运行时，配置文件默认位于项目根目录的 `config.json`；历史和 Mihomo 数据仍位于工作目录下的 `data/`。修改 `CONFIG_FILE` 不会改变历史数据目录。

备份时保留 `.env` 和 `data/`；本地运行还需保留实际使用的配置文件，日志按需归档。可先停止服务再复制文件，避免备份过程中数据变化。不要手动修改自动生成的 Mihomo 配置，后续加载节点时会覆盖它。

以下简写命令适用于手动部署和源码构建。一键部署请重新运行 `node-watcher.sh` 更新，自定义目录需传入相同的 `--dir`；或在 `docker compose` 后增加 `--project-name node-watcher --env-file .env -f compose.deploy.yml`，避免误用目录中已有的其他 Compose 文件。使用独立 Compose 的设备请将 `docker compose` 替换为 `docker-compose`。

```bash
# 查看最近日志并持续跟踪
docker compose logs -f --tail=100

# 停止并移除容器，保留宿主机挂载目录
docker compose down
```

**预编译镜像更新：** 在部署目录执行以下命令，拉取所配置标签的镜像并重新创建容器，挂载的数据目录会保留。

```bash
docker compose pull
docker compose up -d
```

**源码构建更新：** 仅适用于克隆仓库并使用其自带 Compose 配置的部署。

```bash
git pull
docker compose up -d --build
```

修改 `.env` 后，执行 `docker compose up -d` 使容器配置更新。

## 本地开发

使用 Node.js 22（与 Docker 镜像一致）、npm，以及适合当前操作系统和架构的 Mihomo 可执行文件。从项目根目录运行命令：

```bash
npm ci
cp .env.example .env
```

编辑 `.env`，设置 `NODE_ENV=development`、`AUTH_PASSWORD` 和 `AUTH_SESSION_SECRET`。将 Mihomo 放到 `./bin/mihomo`、加入 `PATH`，或通过 `MIHOMO_BIN` 指定其路径，并确保文件具有执行权限。

构建前端并启动服务：

```bash
npm run build
npm start
```

访问 `http://localhost:3000`。开发时可在两个终端分别运行：

```bash
# 终端 1：构建前端，并通过 nodemon 监听后端变更
npm run dev

# 终端 2：启动前端开发服务器，访问终端输出的地址
npm run dev:web
```

Vite 将 `/api` 请求转发至 `http://127.0.0.1:3000`。如更改后端端口，需要同步修改 `vite.config.js`。前端开发服务器默认监听 `0.0.0.0`，请仅在可信网络中使用。

```bash
npm test          # Node.js 测试套件
npm run build     # 前端生产构建
```

### 项目结构

```text
node-watcher.sh     一键部署、依赖安装、参数配置、随机端口与镜像更新
client/             React 前端与界面组件
src/routes/         HTTP API 路由
src/services/       节点解析、订阅、检测、告警、鉴权与报告
src/utils/          配置和日志工具
test/               自动化测试
public/             前端构建产物
data/               运行数据（自动生成）
.github/workflows/  镜像构建与发布流程
```

GitHub Actions 配置为在推送 `main` 分支、`v*` 标签或手动触发时，分别在 `ubuntu-24.04`（AMD64）和 `ubuntu-24.04-arm`（ARM64）原生 runner 上构建镜像，不依赖 QEMU 模拟执行。两个构建均成功后，发布任务验证两种架构齐全，再将镜像合并到 GHCR 的同一标签；任一架构构建失败时，不更新该次发布的标签。

手动构建并发布双架构镜像可使用：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-name/node-watcher:latest \
  --push .
```

## 常用 API

除健康检查和鉴权接口外，调用时均需携带登录后获得的会话 Cookie。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 存活检查，包含 `mihomoReady` 字段 |
| `GET` | `/api/auth/session` | 查询登录状态 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET` | `/api/nodes/public` | 节点状态、在线率与服务检测结果，仍需登录 |
| `POST` | `/api/nodes/reload` | 重新加载来源 |
| `POST` | `/api/nodes/check` | 执行连通性检测；请求体可传 `{"reload":true}` 先刷新来源 |
| `POST` | `/api/nodes/media-check` | 创建流媒体检测任务；请求体可传 `{"nodeIds":["节点ID"]}`，空数组检测全部 |
| `GET` | `/api/nodes/jobs` | 查询检测任务进度 |
| `GET` | `/api/system/status` | 系统、来源与 Mihomo 状态 |
| `GET` | `/api/reports/latest.png` | 根据当前结果生成 PNG 报告 |

## 常见问题

**树莓派拉取时提示 `no matching manifest for linux/arm64/v8`？**

所用镜像标签没有 ARM64 版本。先确认多架构工作流已完整发布成功，再检查镜像包含的平台：

```bash
docker buildx imagetools inspect ghcr.io/leoch627/node-watcher:latest
```

输出应同时包含 `linux/amd64` 和 `linux/arm64`。确认后在部署目录执行 `docker compose pull && docker compose up -d`；一键部署用户直接重新运行 `node-watcher.sh`，自定义目录需传入相同的 `--dir`。如果使用固定版本标签，请检查对应标签；旧标签不会因为 `latest` 更新而自动补齐架构。不要将树莓派的 `platform` 强制改为 `linux/amd64` 来绕过检查；无法等待镜像发布时，可使用「从源码构建」方式在树莓派本机构建。

**拉取预编译镜像提示 `denied` 或 `manifest unknown`？**

确认镜像名为 `ghcr.io/leoch627/node-watcher`、所用标签已发布，并检查对应 GitHub Actions 是否成功。匿名拉取需要 GHCR 软件包设为公开；私有软件包需使用有读取权限的账号先执行 `docker login ghcr.io`。

**容器提示未设置 `AUTH_PASSWORD`，无法启动？**

确认已在仓库根目录创建 `.env`，并填入非空密码。默认 Compose 会在启动前检查该变量。

**网页可以访问，但所有节点检测失败？**

先查看日志和 `/api/health` 中的 `mihomoReady`。Web 服务可访问不代表 Mihomo 已就绪；检查二进制路径、执行权限、端口冲突及来源加载结果，再排查节点和网络。

**修改 `.env` 中的检测周期或通知配置没有生效？**

已有配置文件不会被这些环境变量覆盖，默认 Compose 也没有传入这些变量。请在面板中修改对应设置并保存。

**重启后流媒体结果消失？**

流媒体结果不持久化，请重新触发流媒体检测。PNG 报告根据当前内存中的结果生成，不是历史报告归档。

## 许可证与致谢

本项目采用 **AGPL-3.0-only** 许可证，完整条款见 [LICENSE](LICENSE)。

`src/services/media.js` 的部分检测判定改写自 **lmc999/RegionRestrictionCheck**。改写范围、来源说明和上游版本指纹见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
