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
| 分布式探针 | 主控部署在公网，探针部署在不同网络，通过 TLS 私有协议连回主控，用同一份订阅从多个地点检测并对比 |
| 深度测试 | 基于 [miaospeed](https://github.com/AirportR/miaospeed) 的延迟 RTT / HTTP 延迟、UDP NAT 类型、下载测速和入口 / 出口拓扑分析，生成 Koipy / FullTClash 风格的 PNG 报告 |
| miaospeed 后端 | 主控自带的本机 miaospeed，加上正向（填地址和 token，可接入给 Koipy 用的已有后端）和反向（NAT 后的机器主动连回主控，无需开放端口）后端 |

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
| `--probe-port` | 开启分布式探针，探针通过此 TCP 端口连接主控（见「分布式探针」） | 不开启 |
| `--public-host` | 写进探针加入串的主控公网 IP 或域名 | 打开面板时使用的地址 |
| `--no-probes` | 关闭探针端口映射 | — |
| `--no-install` | 禁止自动安装依赖，适合已配置 Docker 的 NAS | 默认自动安装 |
| `-h, --help` | 查看用法 | — |

也支持 `--port=8080` 形式，以及 `bash node-watcher.sh install ...` / `bash node-watcher.sh update ...`；部署探针用 `bash node-watcher.sh probe --join '...'`（见「分布式探针」）。不带子命令直接安装或更新，不需要回答交互式问题。密码含 `$`、空格等字符时请用 shell 单引号包裹；命令行密码可能进入 shell 历史，不传 `-P` 可使用随机密码。已克隆仓库时，直接运行 `bash node-watcher.sh` 即可。

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

- 启动时加载来源并执行一次连通性检测；之后按检测周期探测，并按**订阅刷新周期**（默认 30 分钟，可单独设置）重新拉取来源。订阅刷新失败时沿用上一次成功的节点列表，节点不会因为订阅服务器短暂故障而从面板消失。
- 默认检测周期为 **5 分钟**，单节点超时为 **10 秒**，并发数为 **8**；并发可设置为 1–32。
- 连通性检测通过 Mihomo 请求 `https://www.gstatic.com/generate_204`（可在设置中改成自定义探测地址），显示的是该请求的延迟，不是 ICMP Ping 或带宽测速结果。
- 一次探测失败后会立即重试 `retryAttempts` 次（0–3，默认 1）；每多一次重试，离线节点每轮最多多耗约 `超时 + 1 秒`，节点很多时建议保持 1–2。
- Mihomo 未就绪（启动中、崩溃重启中）时，本轮检测会被**跳过**：不记录历史、不改变节点状态、不发告警。Mihomo 异常退出会自动按退避间隔重启。
- 在线率为指定时间窗口内「成功检测次数 / 总检测次数」，不是按持续在线时长计算。没有检测记录时不显示在线率。
- 历史按节点、按**小时汇总**保存最近 31 天，不再受检测频率影响，`30d` 在线率覆盖完整 30 天（以小时为粒度）。升级时旧的逐次记录会自动转换，原文件保留为 `history.json.v1.bak`。
- 节点 ID 由「来源 + 协议 + 服务器 + 端口 + 凭据」生成，**不再包含节点名**，机场改名不会重置历史和告警状态。（升级后各节点会获得新的 ID，旧历史不会沿用；如果之前在 `excludeNodes` 里按 ID 排除过节点，需要重新排除。）

### 流媒体与 AI 服务

流媒体检测需手动触发，不随定时连通性检测自动执行。默认任务按节点串行切换 Mihomo 出口，同一节点的各平台请求并行执行，避免不同节点的出口相互干扰；检测前会确认出口选择，检测后再确认一次，期间如果出口被改动（例如配置重载），该节点结果会作废而不是记到错误的节点上。离线节点会被跳过并保留它之前的结果。

**通用项目**：Netflix、YouTube Premium、Disney+、Prime Video、ChatGPT、TikTok、HBO Max。某项本次检测出错时，会保留上次成功的结果并标记为“上次结果”。

**原生解锁 / DNS 解锁**

思路来自 [xykt/RegionRestrictionCheck](https://github.com/xykt/RegionRestrictionCheck)，但判定方式不同：原脚本用 `nslookup`/`dig` 检查**运行脚本那台机器**的 DNS，经代理检测时那台机器是监控主机，节点的 DNS 在机场服务器上解析，照搬会让每个节点都得到监控主机的结果。本项目改为比较**平台看到的客户端 IP**与**节点通用出口 IP**（检测前后各取一次 Cloudflare trace）：

- 相同 → **原生**；不同 → **DNS**（DNS 解锁、SNI 代理或按域名分流到其他出口，三者从外部无法区分）。
- 节点出口前后两次不一致（多出口 / 负载均衡）、或 IPv4 与 IPv6 不同族时，不下结论，悬停可看到原因。
- 仅在平台可访问（可用 / 受限）时标注，和原脚本一致。

| 平台 | 平台看到的 IP 来自 |
| --- | --- |
| Netflix | 影片页 `requestIpAddress` |
| YouTube | 页面 `INNERTUBE_CONTEXT.client.remoteHost` |
| Prime Video | 页面 `customerIPAddress` |
| ChatGPT | `chatgpt.com/cdn-cgi/trace` |
| KKTV | 接口返回的 `ip` |

Disney+、TikTok、HBO Max 及其他区域项目没有回显客户端 IP 的接口，因此不标注解锁类型。以上字段均为 2026-10 实测格式，平台改版后可能失效（失效时只是不显示标注，不会误判）。

**节点地区与区域项目**

- 节点地区优先取节点名里的国旗 emoji（两个区域指示符即 ISO 国家码，如 🇯🇵 → JP）；没有国旗时回退到“香港 / 日本 / HK / JP”等地名和代码；“剩余流量”“到期时间”之类的信息节点不识别地区。
- 流媒体检测会按该地区追加区域专属项目，并读取出口 IP 的实际国家与旗帜地区对比，**不一致时在面板里标出**（例如节点名是 🇯🇵，出口却在 US）。没有旗帜时以出口 IP 所在地区为准。

| 地区 | 区域项目 |
| --- | --- |
| JP | Abema |
| TW | 动画疯（Bahamut）、KKTV、Bilibili 港澳台 |
| HK | Viu TV、Bilibili 港澳台 |
| MO | Bilibili 港澳台 |

其他地区目前只有通用项目。Abema、KKTV、Viu TV、Bilibili 的接口返回格式已实际验证；动画疯会被 Cloudflare 拦截数据中心 IP，此时显示“错误”而不是误报“不可用”。

**并行检测（可选）**：设置 `MEDIA_CONCURRENCY`（1–8，默认 1）后，Mihomo 会为每个额外槽位生成一个独立的选择组和本地监听端口（默认从 `MIHOMO_HTTP_PORT + 10` 起），多个节点可同时检测。该模式依赖 Mihomo `listeners` 的 `proxy` 字段指向代理组，尚未在真实 Mihomo 上验证，建议先小范围试用。

结果反映检测时平台页面或接口的响应，不保证实际账号登录、订阅、播放或使用体验。平台改版、风控、验证码及网络波动都可能影响判定；连通性正常也不代表某个平台一定可用。

### 状态告警

| 渠道 | 需要填写 |
| --- | --- |
| Bark | 完整推送地址，例如 `https://api.day.app/你的Key` |
| 邮件 | SMTP 主机、端口、TLS 设置、账号、密码、发件人和收件人 |
| Telegram | Bot Token 和 Chat ID |

节点首次检测只建立状态基线，不发送告警。告警规则：

- 连续失败 `failureThreshold` 次（默认 2）才发送离线告警；单次失败只在面板上显示离线，不会通知，偶发抖动不再刷屏。
- 只有发送过离线告警的节点，恢复后才发送恢复通知；状态不变不会重复通知。
- 同一轮检测里有多个节点变化时，合并成一条消息（超过 3 个节点时，列表最多显示 15 个）。
- 一轮里 80% 以上节点同时失败（且至少 5 个节点）时，更可能是监控主机网络或 Mihomo 的问题，此时只发一条“大量节点同时检测失败”，暂停逐节点告警；等失败比例回落后再发一条“已恢复”，真正离线的节点仍会正常告警。
- 各渠道并发发送，一个渠道故障不影响其他渠道。

当前节点状态和流媒体结果保存在内存中，重启后需重新检测，首次检测也会重新建立告警基线；在线率历史会从磁盘恢复。

## 分布式探针

一台**主控**（公网，Web 面板、订阅、告警、汇总）加任意台**探针**（不同运营商 / 地区 / 家宽 / 机房），同一份订阅在每个网络里各测一遍。

```text
   探针 A（上海电信）──┐
   探针 B（广州移动）──┼── TLS 1.3 ──▶  主控 :7443   ◀── HTTPS ── 浏览器
   探针 C（东京家宽）──┘                 :3000（面板，经反向代理）
```

- 探针只**主动连出**到主控，不开放任何端口；家宽、NAT 后面都能用。
- 主控统一调度：每轮检测同时下发给本机（可关闭）和所有在线探针，结果按探针分别记录状态、在线率历史和告警。
- 面板「节点」页可切换探针查看，「各探针」列用圆点对比同一节点在每个网络的状态（悬停看延迟）；流媒体检测和 PNG 报告都跟随所选探针。
- 告警会注明探针，例如「节点离线告警 - 东京 01 @ 上海电信」；某个探针上 80% 以上节点同时失败时，只发一条「该探针网络异常」而不是逐节点告警。
- 探针断开超过 `max(3 分钟, 2 × 检测周期)` 会发「探针离线」告警，重连后发「探针已恢复」。

### 协议与安全

| 项目 | 做法 |
| --- | --- |
| 传输 | TLS 1.3，4 字节长度前缀 + JSON 帧，20 秒心跳，65 秒无流量断开重连（退避 1–30 秒） |
| 主控身份 | 首次启动用 `openssl` 生成自签证书（`data/probe-tls/`），探针在加入串里**固定证书 SHA-256 指纹**，中间人无法冒充主控；也可用 `PROBE_TLS_CERT_FILE` / `PROBE_TLS_KEY_FILE` 指定正式证书（此时加入串仍带指纹） |
| 探针身份 | 每个探针一个 192 位随机 token，主控只保存其 SHA-256；可在面板停用、重置或删除，立即断开 |
| 防扫描 / DoS | TLS 握手（含只建 TCP 不握手的连接）与鉴权各 10 秒超时；鉴权前单帧上限 64 KB；同一 IP 10 分钟内鉴权失败 10 次即拒绝；同时握手中的连接上限 64 |
| 重复部署 | 两台机器用了同一个加入串时，后连上的保留，被顶替的探针改为 5 分钟后重试并在日志中说明，不会互相抢连接 |
| 探针权限 | 探针只执行固定操作（加载节点、测活、流媒体检测），不执行主控下发的任何命令或脚本 |

加入串格式：`nwp://<探针ID>:<token>@<主控地址>:<端口>?fp=<证书指纹>`，相当于密码，**只在创建 / 重置时显示一次**。

### 部署步骤（一键脚本）

**第 1 步：主控开启探针端口。** 在主控服务器上重新运行一键脚本，加上 `--probe-port`；面板经内网地址或反向代理域名访问时，再用 `--public-host` 指定探针能连到的公网 IP 或域名：

```bash
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh --probe-port 7443 --public-host 203.0.113.7
```

已有的账号、密码、端口和数据都会保留。然后在防火墙 / 云安全组放行 TCP `7443`。

**第 2 步：添加探针。** 面板「设置 → 探针」输入名称（如「上海电信」），点「添加探针」，复制弹窗里的「一键部署」命令。

**第 3 步：在目标网络的机器上运行这条命令**（Linux x86_64 / ARM64，root）：

```bash
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh probe --join 'nwp://...'
```

脚本会自动安装 Docker、拉取镜像，部署到 `/opt/node-watcher-probe`，并等待探针连上主控；连不上时会根据日志说明原因（端口未放行、证书指纹不符、加入串失效或被另一台机器占用）。探针不开放任何端口。连上后几秒内自动测一轮，之后跟随主控的检测周期。

| 探针脚本参数 | 说明 |
| --- | --- |
| `--join JOIN` | 加入串；更新时可省略，沿用 `.env` 中已保存的值 |
| `-d, --dir PATH` | 部署目录，默认 `/opt/node-watcher-probe` |
| `--no-install` | 不自动安装依赖 |

更新探针：`bash node-watcher.sh probe`。停止并移除：`docker compose -p node-watcher-probe -f /opt/node-watcher-probe/compose.deploy.yml down`。

不用一键脚本时也可以：

```bash
# 已有 Docker
docker run -d --name node-watcher-probe --restart unless-stopped \
  -e NODE_WATCHER_MODE=agent -e NODE_WATCHER_JOIN='nwp://...' \
  ghcr.io/leoch627/node-watcher:latest

# Docker Compose：把 NODE_WATCHER_JOIN 写进 .env
docker compose -f docker-compose.probe.yml up -d

# 源码（需要 Node.js 22 和 mihomo）
NODE_WATCHER_MODE=agent NODE_WATCHER_JOIN='nwp://...' npm start
```

手动部署主控时（不用一键脚本），按 `docker-compose.yml` 放行 7443 即可；如果面板通过域名访问，加入串会自动使用该域名，否则设置 `PROBE_PUBLIC_HOST`（以及端口映射时的 `PROBE_PUBLIC_PORT`）。

| 变量（主控） | 默认值 | 说明 |
| --- | --- | --- |
| `PROBE_PORT` | `7443` | 探针监听端口；`0` 关闭（源码运行）。用 `docker-compose.yml` 时容器内固定 7443，要关闭探针请删掉 7443 那行端口映射 |
| `PROBE_HOST_PORT` | `7443` | 仅 `docker-compose.yml`：映射到宿主机的端口，同时作为加入串里的端口 |
| `PROBE_LISTEN` | `0.0.0.0` | 探针监听地址 |
| `PROBE_PUBLIC_HOST` | 打开面板时使用的主机名 | 写进加入串的主控地址 |
| `PROBE_PUBLIC_PORT` | 同 `PROBE_PORT` | 端口映射 / NAT 时写进加入串的端口 |
| `PROBE_TLS_CERT_FILE` / `PROBE_TLS_KEY_FILE` | 自动生成自签证书 | 使用自有证书 |
| `LOCAL_PROBE` | `true` | 主控本机是否也检测；设为 `false` 时主控不启动 Mihomo，只汇总探针 |
| `LOCAL_PROBE_NAME` | `本机` | 本机探针在面板和告警中的名字 |
| `PROBE_IMAGE` | `ghcr.io/leoch627/node-watcher:latest` | 面板生成的 docker 命令里使用的镜像 |

| 变量（探针） | 说明 |
| --- | --- |
| `NODE_WATCHER_MODE=agent` | 以探针模式运行（无面板、无订阅、无告警） |
| `NODE_WATCHER_JOIN` | 加入串；也可以拆成 `MASTER_ADDR`（host:port）、`PROBE_ID`、`PROBE_TOKEN`、`MASTER_FINGERPRINT` |
| `MEDIA_CONCURRENCY` | 流媒体并行槽位（实验性，同上文） |

探针容器的健康检查访问容器内 `127.0.0.1:3000/api/ready`：Mihomo 就绪且已连上主控时为 200。

### 公网部署建议

- 面板（3000）放在 HTTPS 反向代理之后，并设置 `AUTH_COOKIE_SECURE=true`、`TRUST_PROXY=1`；不要把 3000 端口直接暴露到公网。最简单的 Caddy 配置：

  ```caddyfile
  watch.example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

- 7443 是原始 TLS 端口，**不要**经过 HTTP 反向代理或 CDN，直接放行即可。
- 面板已加安全响应头（CSP、`X-Frame-Options: DENY`、`nosniff`、`no-referrer`），HTTPS 下附带 HSTS。
- 用强密码；`AUTH_SESSION_SECRET` 留空时会生成随机密钥保存在 `data/.session-secret`。
- 订阅 token、节点凭据会通过加密通道下发给探针，探针机器同样要可信。

## 深度测试与 miaospeed 后端

「深度测试」标签页在 miaospeed 后端上运行三类测试，结果可预览、按延迟或速度排序、下载 PNG，最近 30 次保存在 `data/deep-tests/`：

| 测试 | 内容 |
| --- | --- |
| 延迟测试 | 延迟 RTT（TLS 握手后首包往返）、HTTP 延迟（含建连）、UDP NAT 类型（RFC 5780 STUN） |
| 测速 | 在延迟测试基础上逐节点下载测速：平均 / 最大速度与每秒速度曲线；时长、线程和测速文件可选 |
| 拓扑分析 | 入口与出口 IP 的地区、ASN 和组织，入口按 IP 归组，出口按落地 IP 聚类（「簇」表示落地复用） |

> 测速会消耗大量流量：每个节点约为「时长 × 带宽」，千兆节点测 5 秒约 600 MB。请手动运行，不要频繁测速。

后端在「设置 → miaospeed 后端」中管理：

- **本机**：主控自动启动的 miaospeed，只监听 `127.0.0.1`，每次启动使用随机 token。Docker 镜像已内置；源码运行时执行 `npm run setup:bin` 按平台下载官方发布版（Linux / 树莓派 armv6、armv7、arm64 / macOS / Windows，下载后校验 SHA-256；国内可加 `GITHUB_MIRROR=https://ghfast.top/`）。
- **正向**：主控连接一个已在运行的 `miaospeed server`，填写 `ws://` / `wss://` 地址和 token；自签证书可填 SHA-256 指纹锁定，自行编译的 miaospeed 可填编译 token。
- **反向**：添加后面板给出部署命令，目标机器上的 miaospeed 以 `-connect` 主动连到主控 `/miaospeed/reverse/<ID>`，不需要开放端口：

```bash
docker run -d --name miaospeed --restart unless-stopped airportr/miaospeed:4.7.8 \
  server -connect 'wss://你的域名/miaospeed/reverse/<ID>' -token '<token>'
```

反向连接复用面板的 Web 端口。测试任务里包含节点密码，公网请通过 HTTPS 反向代理（有效证书）访问主控并设置 `MIAOSPEED_PUBLIC_URL=wss://你的域名`；miaospeed 只校验系统信任的证书，不支持自签证书指纹。不加密的 `ws://` 只建议在局域网使用。

## 配置说明

登录与 Mihomo 启动参数由环境变量控制；订阅、导入内容、检测设置和通知渠道保存在配置文件中，可通过面板管理。

> **配置文件与环境变量基本不逐项合并。** 已有配置文件时，程序直接读取文件（只有配置文件里**缺失**的 `monitoring` 项会用环境变量或默认值补齐）。`CHECK_INTERVAL_MINUTES`、`TIMEOUT_SECONDS`、`CHECK_CONCURRENCY` 和通知相关环境变量只用于生成缺省配置。默认 Compose 也未传入这些变量，使用 Docker 部署时请优先在面板中修改检测和通知设置。

### 常用环境变量

基础示例见 [`.env.example`](.env.example)，下表还列出了部分可选覆盖项。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端监听端口；默认 Compose 固定为 `3000` |
| `NODE_ENV` | Compose 中为 `production` | 生产模式必须配置登录密码 |
| `AUTH_USERNAME` | `admin` | 登录用户名 |
| `AUTH_PASSWORD` | 无 | 登录密码；默认 Compose 必填 |
| `AUTH_PASSWORD_FILE` | 无 | 从文件读取密码，优先于 `AUTH_PASSWORD`；容器使用时需自行挂载文件并调整 Compose 环境配置 |
| `AUTH_SESSION_SECRET` | 随机生成并保存到 `data/.session-secret`（生产模式） | 会话签名密钥；不再从登录密码派生，也可显式设置 |
| `SESSION_SECRET_FILE` | `data/.session-secret` | 自动生成的会话密钥保存位置 |
| `RETRY_ATTEMPTS` | `1` | 缺省配置的失败重试次数（0–3） |
| `FAILURE_THRESHOLD` | `2` | 缺省配置的连续失败告警阈值 |
| `SUBSCRIPTION_REFRESH_MINUTES` | `30` | 缺省配置的订阅刷新周期 |
| `MEDIA_CONCURRENCY` | `1` | 流媒体并行检测槽位数（1–8，见上文，实验性） |
| `AUTH_SESSION_TTL_HOURS` | `24` | 会话有效时间，单位为小时 |
| `AUTH_COOKIE_SECURE` | `false` | HTTPS 部署时设为 `true` |
| `TRUST_PROXY` | `0` | 位于单层可信反向代理后时可设为 `1` |
| `CONFIG_FILE` | 项目根目录的 `config.json` | Docker 镜像中设为 `/app/data/config.json` |
| `MIHOMO_BIN` | 优先使用 `./bin/mihomo`，否则查找 `PATH` | 本地运行时可指定 Mihomo 可执行文件路径 |
| `MIHOMO_HTTP_PORT` | `23333` | Mihomo HTTP 代理端口 |
| `MIHOMO_SOCKS_PORT` | HTTP 端口 + 1 | `.env.example` 和 Compose 中为 `23334` |
| `MIHOMO_CONTROLLER_PORT` | HTTP 端口 + 2 | `.env.example` 和 Compose 中为 `23335` |
| `MIHOMO_SECRET` | `node-watcher-secret` | Mihomo 控制接口密钥 |
| `MIAOSPEED_LOCAL` | `true` | 设为 `false` 不启动本机 miaospeed |
| `MIAOSPEED_BIN` | 依次查找 `./bin/miaospeed`、`/usr/local/bin/miaospeed`、`PATH` | miaospeed 可执行文件路径 |
| `MIAOSPEED_PORT` | `23380` | 本机 miaospeed 监听的回环端口 |
| `MIAOSPEED_MMDB` | 无 | 本地 GeoIP 数据库（MaxMind 格式，如 DB-IP Lite / GeoLite2 的 City 与 ASN，逗号分隔）；未设置时拓扑分析在线查询 |
| `MIAOSPEED_PUBLIC_URL` | 按访问面板的地址推断 | 反向后端连接主控使用的地址，如 `wss://monitor.example.com` |
| `MIAOSPEED_IMAGE` | `airportr/miaospeed:4.7.8` | 面板生成的 Docker 部署命令使用的镜像 |
| `LOG_CONSOLE` | `true` | 日志同时输出到控制台（`docker logs` 可见）；设为 `false` 只写 `logs/` 文件 |

### 登录与访问边界

除 `/api/health`、`/api/ready` 和 `/api/auth/*` 外，其他 API（包括 `/api/nodes/public`）及 PNG 报告接口均要求有效登录会话。会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。

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

### Mihomo 二进制校验

Docker 构建时下载的 Mihomo 压缩包会用 `sha256sum -c` 校验，期望值固定在 `Dockerfile` 的 `MIHOMO_SHA256_AMD64` / `MIHOMO_SHA256_ARM64` 中，取自 GitHub release 附件的 `digest`。升级 `MIHOMO_VERSION` 时需同时更新这两个值：

```bash
curl -s https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/v1.19.30 \
  | jq -r '.assets[] | select(.name|test("mihomo-linux-(amd64|arm64)-v[0-9.]+\\.gz$")) | "\(.name) \(.digest)"'
```

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
node-watcher.sh     一键部署主控 / 探针、依赖安装、参数配置、随机端口与镜像更新
client/             React 前端与界面组件
src/routes/         HTTP API 路由
src/services/       节点解析、订阅、检测、告警、鉴权与报告
src/probe/          主控 ↔ 探针 TLS 协议、探针注册表、证书
src/agent.js        探针模式入口（NODE_WATCHER_MODE=agent）
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
| `GET` | `/api/health` | 存活检查，包含 `mihomoReady`；Mihomo 未就绪时 `status` 为 `degraded`（HTTP 仍为 200） |
| `GET` | `/api/ready` | 就绪检查：Mihomo 未就绪时返回 503；Docker `HEALTHCHECK` 使用此接口 |
| `GET` | `/api/auth/session` | 查询登录状态 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET` | `/api/nodes/public` | 节点状态、在线率与服务检测结果，仍需登录；`?probe=<探针ID>` 查看指定探针，多探针时每个节点附带 `probes` 对比 |
| `POST` | `/api/nodes/reload` | 重新加载来源 |
| `POST` | `/api/nodes/check` | 执行连通性检测；请求体可传 `{"reload":true}` 先刷新来源 |
| `POST` | `/api/nodes/media-check` | 创建流媒体检测任务；请求体可传 `{"nodeIds":["节点ID"],"probeId":"探针ID"}`，空数组检测全部 |
| `GET` | `/api/nodes/jobs` | 查询检测任务进度 |
| `GET` | `/api/system/status` | 系统、来源与 Mihomo 状态 |
| `GET` | `/api/reports/latest.png` | 根据当前结果生成 PNG 报告；`?probe=<探针ID>` 指定探针 |
| `GET` | `/api/probes` | 探针列表、连接状态与监听信息 |
| `POST` | `/api/probes` | 创建探针 `{"name":"…"}`，返回加入串与部署命令（仅此一次） |
| `POST` | `/api/probes/:id/rotate` | 重置探针密钥，返回新的加入串 |
| `PATCH` | `/api/probes/:id` | 改名或启用 / 停用 `{"name":"…","enabled":false}` |
| `DELETE` | `/api/probes/:id` | 删除探针及其历史 |
| `GET` | `/api/backends` | miaospeed 后端列表与状态（不含 token） |
| `POST` | `/api/backends` | 添加后端：`{"type":"reverse","name":"…"}` 返回部署命令；`{"type":"forward","name":"…","url":"wss://…","token":"…"}` |
| `POST` | `/api/backends/:id/rotate` | 重置反向后端 token，返回新的部署命令 |
| `PATCH` / `DELETE` | `/api/backends/:id` | 改名、启用 / 停用、修改正向地址；删除后端 |
| `GET` | `/api/deep-tests` | 当前任务、测试记录与可用后端 |
| `POST` | `/api/deep-tests` | 开始测试：`{"preset":"latency|speed|topology","backendId":"…","sourceId":"…","include":"正则","exclude":"正则","options":{"downloadDuration":5,"downloadThreading":1}}` |
| `GET` | `/api/deep-tests/:id/report.png` | 测试报告 PNG；`?sort=rtt|http|speed` 排序，`&download=1` 下载 |
| `POST` | `/api/deep-tests/:id/cancel` | 停止正在运行的测试 |

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

先查看日志和 `/api/health` 中的 `mihomoReady`（或访问 `/api/ready`）。Mihomo 异常退出会自动重启，重启期间检测会被跳过而不是记为离线。Web 服务可访问不代表 Mihomo 已就绪；检查二进制路径、执行权限、端口冲突及来源加载结果，再排查节点和网络。

**修改 `.env` 中的检测周期或通知配置没有生效？**

已有配置文件不会被这些环境变量覆盖，默认 Compose 也没有传入这些变量。请在面板中修改对应设置并保存。

**重启后流媒体结果消失？**

流媒体结果不持久化，请重新触发流媒体检测。检测出错时会保留同一进程内上次成功的结果。PNG 报告根据当前内存中的结果生成，不是历史报告归档。

**GitHub Actions 推送镜像时报 `denied: permission_denied: write_package`？**

GHCR 上的 `node-watcher` 镜像包没有授权给当前仓库（常见于删除后重建同名仓库）。到 GitHub 个人主页 → Packages → `node-watcher` → Package settings → Manage Actions access，添加本仓库并设为 Write，然后在 Actions 页面重新运行失败的工作流；或者删除该镜像包，让工作流重新创建。

**探针一直显示离线？**

在探针机器上查看日志（`docker logs node-watcher-probe`）：`Master certificate fingerprint mismatch` 表示加入串里的指纹与主控证书不符（主控重新生成过证书时需重新创建加入串）；`Authentication failed` 表示 token 已被重置或探针已删除；`Another probe connected with the same join string` 表示两台机器用了同一个加入串。连接超时则检查主控的 7443 端口是否放行、`PROBE_PUBLIC_HOST` 是否为探针能访问到的地址。

## 许可证与致谢

本项目采用 **AGPL-3.0-only** 许可证，完整条款见 [LICENSE](LICENSE)。

`src/services/media.js` 的部分检测判定改写自 **lmc999/RegionRestrictionCheck**。改写范围、来源说明和上游版本指纹见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
