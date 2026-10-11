# Node Watcher

自托管的代理节点监控面板，集中查看多订阅节点的连通性、延迟、在线率，以及流媒体、AI 等服务的解锁情况。

Node Watcher 是 [miaospeed](https://github.com/AirportR/miaospeed) 的控制面板：所有检测都在 miaospeed 上执行，主控负责订阅、调度、告警和报告，并可接入多台 miaospeed 作为不同网络里的探针。提供 Web 管理界面、状态变化告警和 PNG 报告，适合部署在 VPS、家用服务器、NAS 或 64 位树莓派上。

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 多来源管理 | 独立拉取多个订阅，单个来源失败不会阻断其他来源；支持导入预检 |
| 节点导入 | 支持 Clash YAML、Base64 通用订阅和节点链接，覆盖 VMess、VLESS、Trojan、Shadowsocks、Hysteria2 / Hy2、TUIC |
| 定时巡检 | 定时在每个启用且开启「巡检」的 miaospeed 后端上检测节点 HTTP 延迟与 RTT，可设置周期、超时、重试和告警阈值；新节点显示为「待检测」 |
| 在线率统计 | 按检测记录计算最近 24 小时、7 天、30 天在线率，每个探针单独统计 |
| 解锁检测 | 基于 [miaospeed-scripts](https://github.com/CloudPassenger/miaospeed-scripts) 的 162 个脚本（流媒体、AI、游戏、网络、搜索、社交），列可自选，按节点地区自动追加区域服务，并展示出口地区 |
| 状态告警 | 节点离线 / 恢复、探针断开 / 恢复，支持 Bark、SMTP 邮件和 Telegram Bot，可分别启用和测试 |
| 检测报告 | 将当前节点状态和解锁结果生成 PNG 矩阵，可预览、下载 |
| 多地探针 | miaospeed 后端：主控自带的本机 miaospeed、正向（连接已有的 miaospeed，例如给 Koipy 用的后端，支持双向 TLS）和反向（NAT 后的机器主动连回主控，无需开放端口），同一份订阅从多个网络检测并对比；每个后端（含本机）可单独启用 / 停用、开关定时巡检 |
| 深度测试 | 延迟 RTT / HTTP 延迟、UDP NAT 类型、单线程 / 多线程的下载与上传测速、入口 / 出口拓扑分析和解锁测试，生成 Koipy / FullTClash 风格的 PNG 报告 |
| 内置 HTTPS | 一键脚本可绑定域名，自动申请并续期 Let's Encrypt 证书（HTTP 验证或 DNS API 验证） |
| 登录保护 | 管理员登录、签名会话 Cookie、登录失败限速 |

## 快速开始

### 一键部署（推荐）

复制以下一行运行，然后按菜单提示操作即可，无需克隆仓库或预先安装 Node.js、Docker、Compose。使用 root 运行；普通用户下载后运行脚本时会自动调用 sudo：

```bash
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh
```

只有 curl 时也可以直接复制运行：

```bash
curl -fL https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh -o node-watcher.sh && bash node-watcher.sh
```

在终端中不带参数运行时，脚本显示当前安装状态和菜单：

```text
1. 安装 / 重新安装主控
2. 部署探针（miaospeed 反向连接）
3. 证书管理（申请 / 重新申请 / 查看到期）
4. 修改面板端口 / 登录密码
5. 查看运行状态与日志
6. 更新
7. 卸载
0. 退出
```

安装主控时逐步询问：安装目录、是否使用域名并申请 HTTPS 证书、证书申请方式、DNS 服务商及其 API 凭据（输入时不显示）、邮箱（可选）、面板端口、用户名和密码。直接回车使用默认值，端口和密码会自动生成；再次安装时可选择沿用上一次的配置。安装完成后显示访问地址和密码，之后输入快捷命令 **`nw`** 即可重新打开菜单。

不使用域名时，默认部署到 **`/opt/node-watcher`**，在 **1000–10000** 中随机选择未占用的 TCP 端口，用户名为 `admin`，密码为 36 位随机十六进制字符串。

#### 域名与 HTTPS 证书

反向探针和公网访问都需要 HTTPS（测试任务包含节点密码）。选择使用域名后，脚本会：

- 让 Compose 把宿主机 **80** 映射到面板的 HTTP 端口、**443** 映射到内置 HTTPS 端口，面板通过 `https://你的域名` 访问；
- 增加一个 `acme` 服务（[acme.sh](https://github.com/acmesh-official/acme.sh) 官方镜像 `neilpang/acme.sh`，守护进程模式），申请 Let's Encrypt 证书并在到期前自动续期，Node Watcher 会自动加载续期后的证书；
- 设置 HTTP 跳转 HTTPS、Secure Cookie，以及反向探针连接主控用的 `MIAOSPEED_PUBLIC_URL=wss://你的域名`。

两种证书申请方式：

| 方式 | 原理 | 要求 |
| --- | --- | --- |
| HTTP 验证 | Let's Encrypt 访问 `http://你的域名/.well-known/acme-challenge/...` 确认域名归属 | 域名 A / AAAA 记录已指向本机；80 端口能从公网访问（防火墙、云安全组放行，未被其他程序占用） |
| DNS API 验证 | acme.sh 通过 DNS 服务商 API 临时添加 TXT 记录 | 需要 DNS 服务商的 API 凭据；不需要开放 80 端口，适合 80 端口被占用或被运营商封锁、位于 NAT 之后的机器 |

两种方式都需要能从外部访问 443 端口才能打开面板和连接反向探针。DNS 验证的凭据只写入部署目录的 `acme.env`，仅供 acme 容器使用。

| DNS 服务商 | `--dns-provider` | 需要的环境变量（acme.sh 标准名称） |
| --- | --- | --- |
| Cloudflare | `cf` | `CF_Token`（API Token，需要该域名的 DNS 编辑权限） |
| 阿里云 | `ali` | `Ali_Key`、`Ali_Secret` |
| DNSPod | `dp` | `DP_Id`、`DP_Key` |
| 腾讯云 | `tencent` | `Tencent_SecretId`、`Tencent_SecretKey` |
| 华为云 | `huaweicloud` | 见 acme.sh 文档 |
| 其他 | acme.sh 的 DNS API 名称 | 见 [acme.sh dnsapi 文档](https://github.com/acmesh-official/acme.sh/wiki/dnsapi) |

#### 自动化 / 非交互部署

传入参数时脚本按参数直接安装或更新，不显示菜单（`bash node-watcher.sh menu` 可强制打开菜单），适合自动化部署：

```bash
# 自定义目录、端口、账号和密码（不使用域名）
bash node-watcher.sh -d /opt/node-watcher -p 8080 -u admin -P 'My$Password!'

# 域名 + HTTP 验证：域名已解析到本机，80、443 端口可从公网访问
bash node-watcher.sh --domain nw.example.com --acme http --acme-email you@example.com

# 域名 + DNS 验证（以 Cloudflare 为例）：先导出服务商的 API 凭据
export CF_Token='你的 Cloudflare API Token'
bash node-watcher.sh --domain nw.example.com --acme dns --dns-provider cf

# 阿里云 DNS
export Ali_Key='...' Ali_Secret='...'
bash node-watcher.sh --domain nw.example.com --acme dns --dns-provider ali
```

| 参数 | 含义 | 首次默认值 |
| --- | --- | --- |
| `-d, --dir` | 部署目录，可包含空格，需要加引号 | `/opt/node-watcher` |
| `-p, --port` | 面板对外 TCP 端口，接受 1–65535 | 随机 1000–10000 |
| `-u, --username` | 登录用户名 | `admin` |
| `-P, --password` | 登录密码 | 36 位随机十六进制密码 |
| `--domain` | 面板域名，启用 HTTPS 并申请证书 | 不使用域名 |
| `--acme http\|dns` | 证书申请方式：HTTP 验证或 DNS API 验证 | — |
| `--dns-provider` | DNS 服务商（`cf`、`ali`、`dp`、`tencent`、`huaweicloud` 等，见上表），凭据通过环境变量传入 | — |
| `--acme-email` | 注册 ACME 账号使用的邮箱 | 可不填 |
| `--no-install` | 禁止自动安装依赖，适合已配置 Docker 的 NAS | 默认自动安装 |
| `-h, --help` | 查看用法 | — |

也支持 `--port=8080` 形式，以及 `bash node-watcher.sh install ...` / `bash node-watcher.sh update ...`；部署探针用 `bash node-watcher.sh probe --connect '<地址>' --token '<token>'`（见「多地探针」）。密码含 `$`、空格等字符时请用 shell 单引号包裹；命令行密码可能进入 shell 历史，不传 `-P` 可使用随机密码。已克隆仓库时，直接运行 `bash node-watcher.sh` 即可。

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
| x86_64 / AMD64 服务器、小主机、NAS | 主控与探针均可，自动选择 AMD64 镜像 |
| ARM64 / aarch64 服务器、NAS、64 位树莓派 | 主控与探针均可，自动选择 ARM64 镜像 |
| 32 位 ARM（armv7，含 32 位 Raspberry Pi OS） | 可作探针：一键脚本部署官方 `airportr/miaospeed` 镜像（支持 amd64 / arm64 / armv7）；主控镜像不提供 32 位版本 |
| Windows | 探针：面板给出的 `miaospeed.exe` 命令可直接运行；主控：从源码运行（Node.js 22 + `npm run setup:bin`，见「本地开发」） |
| macOS | 探针：运行 miaospeed 二进制；主控：从源码运行 |
| Debian / Ubuntu、Docker 官方安装脚本支持的 RPM 发行版 | 缺少 Docker 时通过 ghfast.top 下载官方安装脚本，从清华源安装 Docker CE；兼容 apt / dnf / yum 安装基础依赖 |
| Alpine | 使用 apk 安装 Docker；纯净系统先运行 `apk add --no-cache bash wget ca-certificates` |
| Arch / openSUSE | 使用 pacman / zypper 安装发行版提供的 Docker 与 Compose |
| 已有 Docker 的 NAS | 复用本机 Docker；支持 `docker compose` 和独立 `docker-compose` v2+ |
| systemd / OpenRC / SysV 服务环境 | Docker 未启动时自动尝试启动，并等待服务就绪 |

一键脚本需要 Linux、Bash 和本机 rootful Docker。主控镜像只提供 AMD64 / ARM64，树莓派做主控请使用 64 位系统（`uname -m` 显示 `aarch64`）；32 位 ARM、32 位 x86 设备可以作为探针。NAS 的 Docker 服务若由厂商管理，请先在软件中心启动 Docker / Container Manager。rootless / userns 映射及远程 Docker 主机请使用手动部署。系统自动安装能力受发行版版本和软件源支持范围限制；发行版及 Compose 安装方式参考 [Docker 官方安装文档](https://docs.docker.com/engine/install/) 和 [Compose 安装文档](https://docs.docker.com/compose/install/linux/)。

脚本会自动完成：

- 检测架构、安装缺少的依赖（包括 OpenSSL、jq）并启动 Docker；缺少 Compose 时通过 ghfast.top 下载匹配架构的官方二进制并校验 SHA256。
- 合并 Docker Hub 毫秒镜像配置，并通过 `ghcr.1ms.run` 拉取默认项目镜像。
- 拉取 AMD64 / ARM64 预编译镜像（已内置 miaospeed），无需在树莓派上编译。兼容不支持 `--wait` 的较早 Compose v2，通过容器健康状态确认启动结果。
- 选择未占用的随机端口，或使用传入的端口；后续运行保留已选端口。
- 创建 `.env`，默认用户名为 `admin`，生成 **36 位随机十六进制密码** 和独立的会话密钥。
- 使用域名时配置 acme 服务、申请证书，并设置 HTTPS 跳转、Secure Cookie 和 `MIAOSPEED_PUBLIC_URL`。
- 为 `.env` 设置 `600` 权限，准备 `data/`、`logs/` 并设置容器用户的写入权限；启用 SELinux 的 Docker 自动使用 `:Z` 挂载标签。
- 生成专用的 `compose.deploy.yml`，保留原有 `docker-compose.yml`，启动容器并等待健康检查。
- 安装快捷命令 `nw`；成功后显示访问地址、首次生成的密码及日志查看命令。只有显式传入的参数会覆盖对应设置，其他已有非空设置保留，空白或缺失项自动补全。

密码和密钥保存在目标机器的 `.env` 中，不会写入仓库。首次拉取失败时也会保留生成的配置，修复问题后可直接重试。不使用域名时，若需要公网访问，请将显示的本机地址替换成服务器公网地址，并在防火墙和云安全组中放行显示的 TCP 端口；使用域名时放行 TCP 80 和 443。

**更新或修改设置：** 运行 `nw` 选择「更新」或「修改面板端口 / 登录密码」；也可重新运行 `bash node-watcher.sh`，自定义目录每次传入相同的 `--dir`，例如 `bash node-watcher.sh --dir /srv/node-watcher --port 9090` 只修改端口，保留密码和数据。也可编辑部署目录的 `.env` 后重新运行脚本；设置 `NODE_WATCHER_IMAGE` 可固定已发布的镜像标签。`compose.deploy.yml` 由脚本管理，每次运行会重新生成，请勿在其中保存自定义修改。更换目录表示使用另一份配置和数据，不会自动迁移旧目录。

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

镜像包含前端、后端和 miaospeed（miaospeed 内置代理内核，不需要另装 mihomo 等程序）。发布流程分别构建 `linux/amd64` 与 `linux/arm64`，再合并为同一个多架构镜像标签，适用于 x86_64 服务器、NAS 和 64 位树莓派。Docker 会自动选择匹配宿主机架构的镜像，无需手动指定 `platform`。

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
      MIAOSPEED_PUBLIC_URL: ${MIAOSPEED_PUBLIC_URL:-}
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
```

镜像以非 root 的 `node` 用户运行。Linux 宿主机需确保挂载的 `data/`、`logs/` 可由容器用户（UID/GID `1000:1000`）写入；若出现权限错误，可在上述部署目录中执行 `sudo chown -R 1000:1000 data logs`。使用 rootless Docker 或用户命名空间映射时，请按实际映射调整权限。需要内置 HTTPS 时，参考仓库 `docker-compose.yml` 中注释掉的端口和变量，以及「HTTPS 与公网访问」。

**4. 拉取并启动**

```bash
docker compose pull
docker compose up -d
docker compose ps
```

浏览器访问 `http://服务器IP:3000`，使用 `.env` 中配置的账号和密码登录。此方式不需要执行 `git pull`、`npm install` 或 `docker compose build`。

> 请等待 GitHub Actions 构建发布成功后再拉取。`latest` 用于跟随默认分支构建；如需固定版本，可将镜像标签替换为已发布的 `v*` 标签。自动发布镜像不会自动更新已运行的容器，更新命令见「数据与维护」。

如需修改对外端口，将端口映射改为例如 `"8080:3000"`，然后访问 `http://服务器IP:8080`。仅修改 `.env` 中的 `PORT` 不会改变此 Compose 的端口配置。

### 手动部署：本机端口 + 反向代理

适合宿主机上已经有 Caddy / Nginx，或希望由它们统一管理证书的情况。容器只监听 `127.0.0.1` 的一个高位端口，公网只能经反向代理（443）访问面板；内置 HTTPS 和 acme.sh 都不需要。下文以端口 `38080`、域名 `watch.example.com` 为例，可套 Cloudflare 代理（橙色云朵），也可不套。

**1. 创建部署目录和 `.env`**

```bash
mkdir -p node-watcher/data node-watcher/logs
cd node-watcher
sudo chown -R 1000:1000 data logs
```

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=替换为强密码
AUTH_SESSION_SECRET=替换为 openssl rand -hex 32 的输出
# 面板经 HTTPS 访问：cookie 只走 HTTPS；信任一层反向代理传来的 X-Forwarded-For / X-Forwarded-Proto
AUTH_COOKIE_SECURE=true
TRUST_PROXY=1
# 反向探针连接的地址（经反向代理的 443 端口）
MIAOSPEED_PUBLIC_URL=wss://watch.example.com
```

不要设置 `HTTPS_PORT` 和 `HTTPS_REDIRECT`，TLS 由反向代理负责。

**2. 创建 `docker-compose.yml`**

```yaml
services:
  node-watcher:
    image: ghcr.io/leoch627/node-watcher:latest
    container_name: node-watcher
    ports:
      - "127.0.0.1:38080:3000"   # 只绑定本机回环地址，公网无法直连
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
      AUTH_COOKIE_SECURE: ${AUTH_COOKIE_SECURE:-true}
      TRUST_PROXY: ${TRUST_PROXY:-1}
      MIAOSPEED_PUBLIC_URL: ${MIAOSPEED_PUBLIC_URL:?Set MIAOSPEED_PUBLIC_URL in .env}
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
```

端口映射必须写成 `127.0.0.1:38080:3000`。只写 `38080:3000` 会监听所有网卡，而且 Docker 发布的端口会绕过 ufw 等宿主机防火墙。国内服务器拉取慢时，把镜像换成 `ghcr.1ms.run/leoch627/node-watcher:latest`。

**3. 拉取并启动，确认本机可访问**

```bash
docker compose pull
docker compose up -d
curl -s http://127.0.0.1:38080/api/health
```

返回 `"success":true` 即正常。

**4. 配置反向代理（二选一）**

反向探针通过 `/miaospeed/reverse/` 建立 WebSocket 长连接，反向代理必须转发升级请求，并且不能因为连接空闲而断开它。

*Caddy（推荐）*：自动申请证书，自动处理 WebSocket，没有空闲超时。`/etc/caddy/Caddyfile`：

```caddyfile
watch.example.com {
    reverse_proxy 127.0.0.1:38080
}
```

```bash
sudo systemctl reload caddy
```

*Nginx*：证书可用 certbot 申请，或使用下文的 Cloudflare Origin 证书。`/etc/nginx/conf.d/node-watcher.conf`：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name watch.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;                       # Nginx 1.25.1 以下改为 listen 443 ssl http2; 并删除此行
    server_name watch.example.com;

    ssl_certificate     /etc/nginx/ssl/watch.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/watch.example.com.key;

    location / {
        proxy_pass http://127.0.0.1:38080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # WebSocket：反向探针连接
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        # 默认 60 秒无数据就断开，反向探针会反复掉线
        proxy_read_timeout 1d;
        proxy_send_timeout 1d;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`X-Forwarded-Proto` 不能省：面板据此判断请求是否为 HTTPS，决定安全 cookie 和给反向探针生成的 `wss://` 地址。

**5. 套 Cloudflare 代理时的额外设置**

不使用 Cloudflare 代理（DNS 记录为灰色云朵）时跳过本步。

- **SSL/TLS 模式选 Full (strict)**，不要选 Flexible。源站证书可以继续用 Let's Encrypt，也可以在 Cloudflare 的 SSL/TLS → Origin Server 中创建 Origin 证书（最长 15 年）。Caddy 使用 Origin 证书时，在站点块中加 `tls /etc/caddy/origin.pem /etc/caddy/origin.key`，否则 Caddy 会自己申请证书。miaospeed 看到的是 Cloudflare 的公网证书，满足它只信任公共证书的要求。
- **传递真实客户端 IP。** 此时请求经过两层代理（Cloudflare 和本机反向代理），而 `TRUST_PROXY=1` 只信任一层。面板会把 Cloudflare 节点的 IP 当成访客 IP，登录失败次数按它计数，别人在同一节点试错密码会连带锁住你。请让反向代理改用 Cloudflare 提供的真实 IP：
  - Caddy：`reverse_proxy 127.0.0.1:38080 { header_up X-Forwarded-For {http.request.header.CF-Connecting-IP} }`
  - Nginx：把 `X-Forwarded-For` 一行改为 `proxy_set_header X-Forwarded-For $http_cf_connecting_ip;`
- **源站 443 只放行 Cloudflare IP 段**，否则上述请求头可被直连源站的人伪造：

  ```bash
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    sudo ufw allow proto tcp from "$ip" to any port 443
  done
  ```

  然后删除对所有来源放行 443 的规则（如有）。使用 Origin 证书时也不需要对外开放 80。云服务器的安全组同样可以实现这一限制。
- **关闭 Rocket Loader 和 Email Address Obfuscation**（Speed → Optimization、Scrape Shield）。它们会向页面注入脚本，被面板的 CSP 拦截，导致页面空白。
- **不要拦截反向探针**：Bot Fight Mode、Under Attack 模式和托管质询会拦下 miaospeed 的 WebSocket 连接。开启这些功能时，请在 Security → WAF 中为路径 `/miaospeed/reverse/` 添加跳过规则。WebSockets 开关（Network）保持开启。
- 国内的反向探针经 Cloudflare 连接主控，高峰期可能偶尔断线重连；对这类探针，可以改用正向后端（主控主动连接探针，不经过 Cloudflare）。

**6. 验证**

```bash
curl -s https://watch.example.com/api/health
```

浏览器访问 `https://watch.example.com` 登录后，在「设置 → miaospeed 后端」添加反向后端，给出的连接地址应以 `wss://watch.example.com/miaospeed/reverse/` 开头。

### 从源码构建（可选）

准备好 Git、Docker 和 Docker Compose。仓库的 Docker 构建支持 `linux/amd64` 和 `linux/arm64`，镜像内已包含 miaospeed，无需在宿主机另行安装。

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

> 仓库自带的 `docker-compose.yml` 从本地源码构建镜像，与上方预编译镜像示例不同。首次构建需要下载 npm 依赖和 miaospeed（按 SHA-256 校验），当前 Dockerfile 不支持 32 位 ARM。Linux 挂载目录的写入权限要求与预编译镜像相同。

如需修改对外端口，调整 `docker-compose.yml` 中的端口映射，例如 `"8080:3000"`。仅修改 `.env` 中的 `PORT` 不会改变当前 Compose 的端口配置。

### 首次使用

1. 进入「来源」，添加订阅地址，或通过「导入节点」粘贴节点链接 / Clash YAML；导入前可先预检。
2. 在「来源」页用「全部刷新」或每行的「刷新」重新拉取订阅，并在列表里检查拉取状态和上次更新时间。
3. 在「节点」页点击「检测延迟」立即在所有在线的 miaospeed 后端上执行一轮巡检；在「设置 → 检测与订阅」调整周期、超时、重试、告警阈值和探测地址。
4. 在「设置 → 解锁检测」选择要显示的服务列，然后在「节点」页点击「检测全部节点解锁」；勾选节点后按钮变为「检测选中的 N 个节点解锁」，只检测所选节点。
5. 需要从其他网络检测时，在「设置 → miaospeed 后端」添加探针（见「多地探针」）。
6. 在「设置 → 状态告警」配置通知渠道，并发送测试通知。
7. 在「报告」中预览当前检测矩阵，点击「下载 PNG」保存；在「深度测试」中运行测速和拓扑分析。

## 检测与告警机制

所有检测都由 miaospeed 执行：主控把节点配置和测试项发给 miaospeed 后端（本机、正向或反向），miaospeed 用内置的代理内核逐个连接节点并返回结果。

### 定时巡检与在线率

- 启动时加载来源并执行一次巡检；之后按检测周期巡检，并按**订阅刷新周期**（默认 30 分钟，可在设置中修改）重新拉取订阅。每个订阅也可以在「来源 → 编辑」里单独设置刷新间隔（填 0 表示只手动刷新）；「来源」页每行的「刷新」按钮立即重新拉取该订阅，「全部刷新」重新拉取所有来源。添加、编辑、停用订阅只下载有变化的那一个，不会重新拉取其他订阅。
- 订阅刷新失败时沿用上一次成功的节点列表，节点不会因为订阅服务器短暂故障而从面板消失。
- 刷新成功后订阅里已经没有的节点：默认保留在列表中并标记「已不在订阅中」，不再检测、不计入统计和报告、不发告警，可用「排除」手动移除；在「设置 → 检测与订阅」打开「订阅更新后自动删除已不存在的节点」后会直接删除。保留的节点只在内存中，主控重启后不再显示。
- 每轮在**每个启用、开启「巡检」且在线的后端**上并行运行 `TEST_PING_CONN`（HTTP 延迟）和 `TEST_PING_RTT`（延迟 RTT），各后端分别记录节点状态、在线率历史和告警。并发由 miaospeed 控制，不再单独设置并发数。
- HTTP 延迟决定在线 / 离线：经节点请求 `http://www.gstatic.com/generate_204`（可在设置中改成自定义探测地址），包含经代理建连的时间，HTTPS 地址还包含一次 TLS 握手；它不是 ICMP Ping 或带宽测速结果。
- 「使用 1-RTT 延迟」（默认开启）把 RTT 作为面板上的主延迟：只计已建立的连接上一次请求的往返（HTTP 地址为同一连接上的第二个请求，HTTPS 地址为 TLS 握手后的首个请求），与 mihomo 的 `unified-delay`（Clash Party 的「使用 1-RTT 延迟测试」）口径相同。关闭后改为显示含建连的 HTTP 延迟。两个值都会记录，开关只影响显示，不影响在线判定和 PNG 报告（报告两列都有）。
- 默认检测周期为 **5 分钟**，单节点超时为 **10 秒**；miaospeed 单次请求最长 10 秒，更大的设置值按 10 秒执行。
- 一次探测失败后由 miaospeed 立即重试 `retryAttempts` 次（0–3，默认 1）。
- 后端离线（反向探针未连接、正向后端连不上、本机 miaospeed 未就绪）时，该后端本轮被**跳过**：不记录历史、不改变节点状态、不发节点告警。没有任何可用后端时整轮跳过。本机 miaospeed 异常退出会自动按退避间隔重启。
- 在线率为指定时间窗口内「成功检测次数 / 总检测次数」，不是按持续在线时长计算。没有检测记录时不显示在线率。
- 历史按节点、按**小时汇总**保存最近 31 天，不再受检测频率影响，`30d` 在线率覆盖完整 30 天（以小时为粒度）。本机后端使用 `data/history.json`，其他后端使用 `data/history-<后端ID>.json`；删除后端会同时删除其历史。
- 节点 ID 由「来源 + 协议 + 服务器 + 端口 + 凭据」生成，**不包含节点名**，机场改名不会重置历史和告警状态。

### 解锁检测

解锁检测可以手动触发（「节点」页右上方的解锁检测按钮），也可以在「设置 → 解锁检测 → 定时检测」设置每隔 N 小时自动检测一次全部节点（0 = 关闭，默认关闭；例如填 24 即每天一次）。手动检测在当前选中的探针上运行，定时检测在默认后端上运行；离线节点会被跳过并保留之前的结果。定时检测开始时后端不在线，会在 1 小时后重试。

每次检测（手动或定时）都会和该节点上一次的明确结果比较（保存在 `data/events.json`，重启不丢失；脚本报错的结果不参与比较）：

- 原本解锁、这次变成失败 / 受限 / N/A：节点表里该服务带**红点**标记（悬停显示原解锁地区和失效时间），「节点」页顶部提示有几个节点解锁失效，状态筛选可选「解锁失效」；同时写入「日志」。
- 之后重新解锁：红点消失，日志记录「恢复解锁」。解锁地区变化（如 JP → US）也会记入日志。

「日志」页记录解锁变化和每次解锁检测的汇总、节点确认离线 / 恢复在线（与告警使用相同的连续失败阈值，不受通知是否送达影响）、订阅拉取失败 / 恢复以及节点增减、后端连接 / 断开，可按类别筛选，保留最近 2000 条。

- 使用随项目附带的 [CloudPassenger/miaospeed-scripts](https://github.com/CloudPassenger/miaospeed-scripts) v1.0.0（162 个脚本，分为流媒体、AI、游戏、网络、搜索、社交），脚本在 miaospeed 的沙箱中运行，单个脚本超时 15 秒。
- 在「设置 → 解锁检测」中选择要检测并显示的服务（最多 30 个，按选择顺序作为节点表和报告的列）。默认列：Netflix、Disney+、YouTube、Prime Video、HBO Max、ChatGPT、Claude、Gemini、TikTok。
- 结果按脚本给出的颜色分为「解锁」「受限」「失败」「N/A」「未知」；解锁时显示脚本识别的地区，悬停可看到脚本原文和耗时。某项本次出错时，保留上次成功的结果并标记为“上次成功结果”。
- 同时读取出口 IP 的地区（GeoIP），在「地区」列显示。

**节点地区与区域服务**

- 节点地区优先取节点名里的国旗 emoji（两个区域指示符即 ISO 国家码，如 🇯🇵 → JP）；没有国旗时回退到“香港 / 日本 / HK / JP”等地名和代码；“剩余流量”“到期时间”之类的信息节点不识别地区。节点名没有地区时以出口 IP 所在地区显示。
- 出口 IP 的实际地区与节点名标注不一致时，面板里会标出（例如节点名是 🇯🇵，出口却在 US），报告中显示为 `JP≠US`。
- 开启「按节点地区自动追加区域服务」（默认开启）后，会按节点名识别出的地区追加该地区专属的流媒体脚本（每个地区最多 4 个，按脚本优先级选择，例如 JP 追加 Abema、dアニメストア、DMM TV、FOD，TW 追加动画疯、MyVideo 等）。

结果反映检测时平台页面或接口的响应，不保证实际账号登录、订阅、播放或使用体验。平台改版、风控、验证码及网络波动都可能影响判定；连通性正常也不代表某个平台一定可用。

### 状态告警

| 渠道 | 需要填写 |
| --- | --- |
| Bark | 完整推送地址，例如 `https://api.day.app/你的Key` |
| 邮件 | SMTP 主机、端口、TLS 设置、账号、密码、发件人和收件人 |
| Telegram | Bot Token 和 Chat ID |

节点首次检测只建立状态基线，不发送告警。告警规则（每个后端分别计算）：

- 连续失败 `failureThreshold` 次（默认 2）才发送离线告警；单次失败只在面板上显示离线，不会通知，偶发抖动不会刷屏。
- 只有发送过离线告警的节点，恢复后才发送恢复通知；状态不变不会重复通知。
- 同一轮检测里有多个节点变化时，合并成一条消息（超过 3 个节点时，列表最多显示 15 个）。
- 一轮里 80% 以上节点同时失败（且至少 5 个节点）时，更可能是该后端所在网络的问题，此时只发一条“大量节点同时检测失败”，暂停逐节点告警；等失败比例回落后再发一条“已恢复”，真正离线的节点仍会正常告警。
- 有多个后端时，告警会注明来自哪个探针。
- 正向 / 反向后端断开超过 `max(3 分钟, 2 × 检测周期)` 会发「探针离线」告警；只有发送过离线告警的后端，重新连上后才发「探针已恢复」。
- 各渠道并发发送，一个渠道故障不影响其他渠道。

当前节点状态和解锁结果保存在内存中，重启后需重新检测，首次检测也会重新建立告警基线；在线率历史会从磁盘恢复。

## 多地探针（miaospeed 后端）

一台**主控**（Web 面板、订阅、告警、汇总）加任意个 **miaospeed 后端**。每个后端就是一个探针，同一份订阅在每个网络里各测一遍：

```text
                              ┌── 本机 miaospeed（主控自动启动，只监听 127.0.0.1）
浏览器 ── HTTPS ──▶  主控  ───┼◀── wss ── 反向探针：家宽 / NAT 后的机器主动连回，无需开放端口
                              └── ws(s) ──▶ 正向后端：已在运行的 miaospeed server
```

| 类型 | 说明 |
| --- | --- |
| 本机 | 主控启动的 miaospeed 子进程，只监听 `127.0.0.1`，每次启动使用随机 token 和路径。Docker 镜像已内置；源码运行时执行 `npm run setup:bin`。`MIAOSPEED_LOCAL=false` 可关闭，主控只使用远程后端 |
| 反向 | 在目标机器上运行 `miaospeed server -connect wss://<主控>/miaospeed/reverse/<ID> -token <token>`，miaospeed 主动连到主控，探针机器不需要开放端口（推荐） |
| 正向 | 主控连接一个已在运行的 `miaospeed server`：填写 `ws://` / `wss://` 地址和 token；`wss://` 可固定证书指纹、指定自己的 CA，并出示客户端证书（双向 TLS），自行编译的 miaospeed 可填编译 token |

所有后端都在「设置 → miaospeed 后端」中管理，可编辑、删除，反向后端可重置 token。每个后端（包括本机）有两个开关：「启用」关闭后该后端不再被使用（本机 miaospeed 进程会停止，重新启用后自动启动，重启主控后仍保持关闭）；「巡检」只决定是否参与定时巡检，关闭后仍可用于深度测试，例如只想偶尔用来测速的 Koipy 后端。「节点」页可切换探针查看，「各探针」列用圆点对比同一节点在每个网络的状态（悬停看延迟）；解锁检测和 PNG 报告跟随所选探针，深度测试可选择在哪个后端上运行。

### 部署反向探针

**第 1 步：主控启用 HTTPS。** 反向连接经公网传输节点密码，需要 `wss://`。推荐用一键脚本的域名模式部署主控（见「域名与 HTTPS 证书」）；已有自己的反向代理时，见「HTTPS 与公网访问」并设置 `MIAOSPEED_PUBLIC_URL=wss://你的域名`。

**第 2 步：添加后端。** 面板「设置 → miaospeed 后端」点「添加反向后端」，输入名称（如「上海电信」）。弹窗给出连接地址、token（**只显示这一次**）和几种部署命令。

**第 3 步：在探针机器上运行其中一条命令。** 一键脚本（Linux，root）有两种部署方式：

- **Docker（默认）**：自动安装 Docker，运行官方镜像 `airportr/miaospeed:4.7.8`（amd64 / arm64 / armv7，包括 32 位 Raspberry Pi OS）。
- **二进制（`--mode binary`）**：不装 Docker，下载对应架构的 miaospeed 官方发布版（校验 SHA-256）并注册为 systemd 服务（Alpine 为 OpenRC），开机自启；进程崩溃后 5 秒自动拉起，5 分钟内连续失败 5 次就停止拉起，留给你手动检查（`systemctl status miaospeed`、`journalctl -u miaospeed -n 50`，处理后 `systemctl reset-failed miaospeed && systemctl start miaospeed`）。主控暂时离线不算失败：miaospeed 会自己重连。

```bash
# Docker
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh probe --connect 'wss://nw.example.com/miaospeed/reverse/<ID>' --token '<token>'
# 二进制 + systemd
wget -N https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh && bash node-watcher.sh probe --mode binary --connect 'wss://nw.example.com/miaospeed/reverse/<ID>' --token '<token>'
```

也可以运行 `bash node-watcher.sh` 后在菜单中选「部署探针」，按提示选择部署方式并粘贴地址和 token。已有 Docker 时也可以直接：

```bash
docker run -d --name miaospeed --restart unless-stopped airportr/miaospeed:4.7.8 \
  server -connect 'wss://nw.example.com/miaospeed/reverse/<ID>' -token '<token>'
```

没有 Docker 的机器（包括 Windows、macOS）可从 [miaospeed 发布页](https://github.com/AirportR/miaospeed/releases) 下载对应平台的二进制，运行 `./miaospeed server -connect '<地址>' -token '<token>'`（Windows 为 `miaospeed.exe server -connect "<地址>" -token "<token>"`）。

miaospeed 连上后，面板中该后端显示「在线」，几秒后自动巡检一轮，之后跟随主控的检测周期。重置 token 后旧连接立即断开，需要用新命令重新启动探针上的 miaospeed。

### 接入正向后端

已经在运行的 miaospeed（例如给 Koipy 用的后端）可以直接接入：点「添加正向后端」，填写地址（如 `wss://example.com:8765/path`）和 token。主控每 2 分钟检查一次正向后端能否连接。

`wss://` 后端的服务器证书有三种校验方式：

| 方式 | 适用场景 |
| --- | --- |
| 公共 CA | 后端使用 Let's Encrypt 等公认证书，按域名校验（默认） |
| 固定指纹 | `miaospeed server -mtls` 使用内置证书或自签证书时。点「读取」获取后端当前证书的 SHA-256 指纹，确认后保存，之后只接受这张证书 |
| 自定义 CA | 后端用 `-serverpublickey` / `-serverprivatekey` 加载自己 CA 签发的证书；证书里的名字与地址不同时填写「证书域名」 |

**双向 TLS（mTLS）。** 在添加 / 编辑对话框里填好地址后，点「一键生成 mTLS 证书」，面板会生成一套证书：私有 CA、给后端用的服务器证书（包含地址中的域名或 IP）和给主控用的客户端证书，并自动填好「自定义 CA」和「出示客户端证书」。对话框同时给出一段命令，在后端机器上运行即可写入 `ca.crt`、`server.crt`、`server.key` 并启动：

```bash
./miaospeed server -bind 0.0.0.0:8765 -path '/path' -token '<token>' -mtls -serverpublickey server.crt -serverprivatekey server.key -clientca ca.crt -upload
```

CA 私钥不会保存，需要更换时重新生成一套。也可以粘贴已有的 CA、客户端证书和私钥（PEM，私钥不能加密）。注意：miaospeed 的 `-clientca` 是「出示了就校验」——证书不对的客户端会被拒绝，但不带证书的客户端仍能连接，身份认证仍以 token 为准。反向后端由 miaospeed 主动连接主控，miaospeed 不支持出示客户端证书，因此不适用 mTLS（主控证书 + token 认证）。

### 安全说明

| 项目 | 做法 |
| --- | --- |
| token | 每个反向后端一个随机 token，只在创建 / 重置时显示一次；握手按 token 校验并防重放，每个测试任务也用 token 签名。面板 API 不返回任何 token，token 保存在主控的配置文件中 |
| 证书 | 反向探针上的 miaospeed 按系统根证书校验主控证书，因此主控需要公认 CA 签发、与域名匹配的证书（一键脚本申请的 Let's Encrypt 证书即可），**不支持自签证书**。正向 `wss://` 默认按域名校验，也可固定指纹或指定自己的 CA，并可出示客户端证书（见「接入正向后端」）；客户端私钥保存在主控配置文件中，面板 API 不返回 |
| ws:// | 不加密，测试任务里的节点密码会明文传输，只在局域网使用 |
| 端点 | 反向连接地址 `/miaospeed/reverse/<ID>` 在 HTTP 和 HTTPS 端口上都可用，不受 HTTPS 跳转影响；未知或已停用的 ID 直接拒绝，握手 10 秒超时 |
| 数据 | 测试任务包含节点地址和凭据，会交给执行测试的 miaospeed。探针只部署在可信的机器上，正向后端只接入自己信任的服务 |

## 深度测试

「深度测试」页在 miaospeed 后端上运行四类测试，结果可预览、按延迟或速度排序、下载 PNG，最近 30 次保存在 `data/deep-tests/`：

| 测试 | 内容 |
| --- | --- |
| 延迟测试 | 延迟 RTT（TLS 握手后首包往返）、HTTP 延迟（含建连）、UDP NAT 类型（RFC 5780 STUN） |
| 测速 | 单线程下载、多线程下载、单线程上传、多线程上传四种方式任选，附带延迟与 UDP 类型；每种方式一轮，各出平均 / 最大速度与每秒速度曲线；时长、多线程数、下载测速文件和上传地址可选 |
| 拓扑分析 | 入口与出口 IP 的地区、ASN 和组织，入口按 IP 归组，出口按落地 IP 聚类（「簇」表示落地复用） |
| 解锁测试 | 「设置 → 解锁检测」中选择的服务（API 可用 `options.scripts` 另选，最多 30 个）加出口地区，生成 FullTClash「连通性测试」风格的矩阵，末行为各服务的解锁占比 |

测速的每种方式是一个独立的 miaospeed 任务、依次运行：miaospeed 同一任务里的测试项是并发执行的，下载和上传放在一起会互相抢带宽，线程数也只能设一个。某一轮失败（例如后端用 `-nospeed` 禁止了下载测速）会记为提示，其他轮继续。

上传测速需要后端以 `-upload` 启动（miaospeed 默认拒绝上传测速）。本机 miaospeed、一键脚本部署的探针和面板给出的部署命令都已带上；其他已有的后端（例如给 Koipy 用的）请自行加上该参数，否则上传结果全部为 0，报告和页面会给出提示。

> 测速会消耗大量流量：每个节点每轮约为「时长 × 带宽」，千兆节点测 5 秒约 600 MB，勾选几种方式就乘几倍。请手动运行，不要频繁测速；在按流量计费的探针机器上尤其注意。

可按来源和名称正则（包含 / 排除）筛选节点。拓扑分析默认在线查询 IP 信息，设置 `MIAOSPEED_MMDB` 后本机 miaospeed 改用本地 GeoIP 数据库。

## HTTPS 与公网访问

面板和反向探针连接都应通过 HTTPS 访问。三种方式任选其一：

**1. 一键脚本 + 域名（推荐）。** 见「域名与 HTTPS 证书」，证书申请、续期、跳转和相关变量都由脚本配置。

**2. 手动部署使用内置 HTTPS。** Node Watcher 自带 HTTPS 监听：

- 设置 `HTTPS_PORT`（例如 `3443`），把证书和私钥（PEM）放到 `data/tls/fullchain.pem`、`data/tls/key.pem`（或用 `TLS_CERT_FILE` / `TLS_KEY_FILE` 指定）。文件出现后 HTTPS 自动启动，证书文件更新后自动重新加载，无需重启。
- HTTP 端口会把 `ACME_WEBROOT`（默认 `data/acme`）作为 `/.well-known/acme-challenge/` 提供，可用 acme.sh / certbot 的 webroot 模式申请证书（webroot 指向部署目录的 `data/acme`），再把证书安装到 `data/tls/`。
- `HTTPS_REDIRECT=true` 时，只要 HTTPS 监听在运行，普通 HTTP 请求就跳转到 HTTPS，但 ACME 验证、`/api/health`、`/api/ready` 和反向探针连接除外；对外 HTTPS 端口不是 443 时用 `HTTPS_PUBLIC_PORT` 指定跳转端口。
- 同时设置 `AUTH_COOKIE_SECURE=true` 和 `MIAOSPEED_PUBLIC_URL=wss://你的域名`。仓库的 `docker-compose.yml` 中有注释掉的示例（`80:3000`、`443:3443`）。`/api/health` 的 `https` 字段显示 HTTPS 是否已启动、证书域名与到期时间及错误原因。

**3. 使用自己的反向代理。** 面板放在 HTTPS 反向代理之后，只绑定本机端口，设置 `AUTH_COOKIE_SECURE=true`、`TRUST_PROXY=1` 和 `MIAOSPEED_PUBLIC_URL=wss://你的域名`。反向代理需要转发 WebSocket 升级请求（`/miaospeed/reverse/`）且不能空闲超时。完整步骤（Docker Compose、Caddy / Nginx 配置、套 Cloudflare 代理）见「手动部署：本机端口 + 反向代理」。

其他建议：

- 面板已加安全响应头（CSP、`X-Frame-Options: DENY`、`nosniff`、`no-referrer`），HTTPS 下附带 HSTS。
- 用强密码；`AUTH_SESSION_SECRET` 留空时会生成随机密钥保存在 `data/.session-secret`。

## 配置说明

登录、miaospeed 和 HTTPS 参数由环境变量控制；订阅、导入内容、检测设置、解锁检测列、miaospeed 后端和通知渠道保存在配置文件中，可通过面板管理。

> **配置文件与环境变量基本不逐项合并。** 已有配置文件时，程序直接读取文件（只有配置文件里**缺失**的 `monitoring` 项会用环境变量或默认值补齐）。`CHECK_INTERVAL_MINUTES`、`TIMEOUT_SECONDS` 和通知相关环境变量只用于生成缺省配置。默认 Compose 也未传入这些变量，使用 Docker 部署时请优先在面板中修改检测和通知设置。

### 常用环境变量

基础示例见 [`.env.example`](.env.example)，下表还列出了部分可选覆盖项。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端 HTTP 监听端口；默认 Compose 固定为 `3000` |
| `NODE_ENV` | Compose 中为 `production` | 生产模式必须配置登录密码 |
| `AUTH_USERNAME` | `admin` | 登录用户名 |
| `AUTH_PASSWORD` | 无 | 登录密码；默认 Compose 必填 |
| `AUTH_PASSWORD_FILE` | 无 | 从文件读取密码，优先于 `AUTH_PASSWORD`；容器使用时需自行挂载文件并调整 Compose 环境配置 |
| `AUTH_SESSION_SECRET` | 随机生成并保存到 `data/.session-secret`（生产模式） | 会话签名密钥；不从登录密码派生，也可显式设置 |
| `SESSION_SECRET_FILE` | `data/.session-secret` | 自动生成的会话密钥保存位置 |
| `AUTH_SESSION_TTL_HOURS` | `24` | 会话有效时间，单位为小时 |
| `AUTH_COOKIE_SECURE` | `false` | 通过 HTTPS 访问面板时设为 `true` |
| `TRUST_PROXY` | `0` | 位于单层可信反向代理后时可设为 `1` |
| `CONFIG_FILE` | 项目根目录的 `config.json` | Docker 镜像中设为 `/app/data/config.json` |
| `RETRY_ATTEMPTS` | `1` | 缺省配置的失败重试次数（0–3） |
| `FAILURE_THRESHOLD` | `2` | 缺省配置的连续失败告警阈值 |
| `SUBSCRIPTION_REFRESH_MINUTES` | `30` | 缺省配置的订阅刷新周期 |
| `CUSTOM_HEALTH_CHECK_URL` | 空（`http://www.gstatic.com/generate_204`） | 缺省配置的巡检探测地址 |
| `MIAOSPEED_LOCAL` | `true` | 设为 `false` 不启动本机 miaospeed，只使用正向 / 反向后端 |
| `MIAOSPEED_BIN` | 依次查找 `./bin/miaospeed`、`/usr/local/bin/miaospeed`、`PATH` | miaospeed 可执行文件路径 |
| `MIAOSPEED_PORT` | `23380` | 本机 miaospeed 监听的回环端口 |
| `LOCAL_PROBE_NAME` | `本机` | 本机后端在面板、报告和告警中的名字 |
| `MIAOSPEED_MMDB` | 无 | 本地 GeoIP 数据库（MaxMind 格式，如 DB-IP Lite / GeoLite2 的 City 与 ASN，逗号分隔）；未设置时拓扑分析在线查询 |
| `MIAOSPEED_PUBLIC_URL` | 按访问面板的地址推断 | 反向后端连接主控使用的地址，如 `wss://monitor.example.com` |
| `MIAOSPEED_IMAGE` | `airportr/miaospeed:4.7.8` | 面板生成的 Docker 部署命令使用的镜像 |
| `PROBE_SCRIPT_URL` | ghfast.top 加速的 `node-watcher.sh` 地址 | 面板生成的探针一键部署命令使用的脚本地址 |
| `HTTPS_PORT` | 无（不启用 HTTPS） | 内置 HTTPS 监听端口；一键脚本使用 `3443` 并映射到宿主机 443 |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | `data/tls/fullchain.pem` / `data/tls/key.pem` | 证书与私钥（PEM）；文件出现后 HTTPS 自动启动，更新后自动重新加载 |
| `ACME_WEBROOT` | `data/acme` | 在 HTTP 端口的 `/.well-known/acme-challenge/` 下提供，用于 Let's Encrypt HTTP-01 验证 |
| `HTTPS_REDIRECT` | `false` | 设为 `true` 时 HTTP 跳转到 HTTPS（ACME 验证、`/api/health`、`/api/ready` 和反向探针连接除外） |
| `HTTPS_PUBLIC_PORT` | `443` | 对外 HTTPS 端口不是 443 时，跳转地址使用的端口 |
| `LOG_CONSOLE` | `true` | 日志同时输出到控制台（`docker logs` 可见）；设为 `false` 只写 `logs/` 文件 |

### 登录与访问边界

除 `/api/health`、`/api/ready` 和 `/api/auth/*` 外，其他 API（包括 `/api/nodes/public`）及 PNG 报告接口均要求有效登录会话。反向探针连接 `/miaospeed/reverse/<ID>` 不使用面板会话，而是用各自的 token 鉴权。会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。

局域网直接使用 HTTP 时保持：

```dotenv
AUTH_COOKIE_SECURE=false
TRUST_PROXY=0
```

通过内置 HTTPS 访问时设置 `AUTH_COOKIE_SECURE=true`；通过单层可信 HTTPS 反向代理访问时设置：

```dotenv
AUTH_COOKIE_SECURE=true
TRUST_PROXY=1
```

不要在 HTTP 部署中启用 Secure Cookie，否则登录会话无法正常使用。本机 miaospeed 只监听 `127.0.0.1`，使用每次启动随机生成的 token。订阅凭据、后端 token、SMTP 密码和 Bot Token 会保存在本机文件中，请限制文件访问权限，避免提交 `.env`、数据目录或真实订阅内容。

非生产模式未设置密码时会关闭鉴权；开发环境也应设置密码，尤其是允许其他设备访问时。

### miaospeed 二进制校验

Docker 构建时下载的 miaospeed 压缩包会用 `sha256sum -c` 校验，期望值固定在 `Dockerfile` 的 `MIAOSPEED_SHA256_AMD64` / `MIAOSPEED_SHA256_ARM64` 中；`npm run setup:bin` 按 `scripts/setup-binaries.js` 中各平台的 SHA-256 校验后才解压。两处的值都取自 GitHub release 附件的 `digest`。升级 `MIAOSPEED_VERSION` 时需同时更新两处：

```bash
curl -s https://api.github.com/repos/AirportR/miaospeed/releases/tags/4.7.8 \
  | jq -r '.assets[] | select(.name|test("^miaospeed-.*\\.(tar\\.gz|zip)$")) | "\(.name) \(.digest)"'
```

## 数据与维护

一键部署、预编译镜像示例与仓库自带的 Docker Compose 均挂载以下目录：

| 宿主机路径 | 内容 |
| --- | --- |
| `data/config.json` | 订阅、导入节点、检测参数、解锁检测列、miaospeed 后端（含 token）、通知配置等 |
| `data/history.json` | 本机后端的巡检历史，用于在线率统计 |
| `data/history-<后端ID>.json` | 其他后端的巡检历史 |
| `data/deep-tests/` | 最近 30 次深度测试结果 |
| `data/tls/`、`data/acme/` | HTTPS 证书与私钥、ACME 验证文件（启用 HTTPS 时） |
| `logs/` | 应用日志 |
| `.env` | 登录和容器启动配置 |
| `acme.env` | 一键脚本 DNS 验证使用的服务商 API 凭据（仅使用 DNS 验证时） |

本地非 Docker 运行时，配置文件默认位于项目根目录的 `config.json`；历史、深度测试记录和证书仍位于工作目录下的 `data/`。修改 `CONFIG_FILE` 不会改变历史数据目录。

备份时保留 `.env` 和 `data/`（一键部署还应保留 `acme.env`）；本地运行还需保留实际使用的配置文件，日志按需归档。可先停止服务再复制文件，避免备份过程中数据变化。

以下简写命令适用于手动部署和源码构建。一键部署请运行 `nw` 选择「更新」，或重新运行 `node-watcher.sh`（自定义目录需传入相同的 `--dir`）；也可在 `docker compose` 后增加 `--project-name node-watcher --env-file .env -f compose.deploy.yml`，避免误用目录中已有的其他 Compose 文件。使用独立 Compose 的设备请将 `docker compose` 替换为 `docker-compose`。

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

使用 Node.js 22（与 Docker 镜像一致）和 npm，Linux、macOS、Windows 均可。从项目根目录运行命令：

```bash
npm ci
npm run setup:bin   # 下载本平台的 miaospeed 到 ./bin 并校验 SHA-256
cp .env.example .env
```

`npm run setup:bin` 支持 Linux（x86_64、arm64、树莓派 armv6 / armv7 等）、macOS、FreeBSD 和 Windows（解压依赖系统自带的 `tar`，Windows 10 及以上已内置）；国内网络可加 `GITHUB_MIRROR=https://ghfast.top/`，也可通过 `HTTPS_PROXY` 使用代理。已有 miaospeed 时也可以用 `MIAOSPEED_BIN` 指定路径。Windows PowerShell 中复制配置用 `Copy-Item .env.example .env`。

编辑 `.env`，设置 `NODE_ENV=development`、`AUTH_PASSWORD` 和 `AUTH_SESSION_SECRET`。

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
node-watcher.sh          一键部署与菜单：主控、探针、证书、更新、卸载
client/                  React 前端与界面组件
src/routes/              HTTP API 路由
src/services/            订阅与节点解析、巡检与解锁调度（scheduler）、在线率（monitor）、告警、鉴权、深度测试与报告
src/services/probes.js   探针注册表：每个 miaospeed 后端独立的节点状态、历史和告警
src/services/render/     PNG 报告的 SVG 表格绘制
src/miaospeed/           miaospeed 协议与签名、本机进程、正向 / 反向后端、任务执行、解锁脚本目录
src/assets/              Twemoji 国旗图形、随附的 miaospeed-scripts
src/utils/               配置、日志、内置 HTTPS、旧版残留清理
scripts/                 setup-binaries.js（npm run setup:bin）
test/                    自动化测试
public/                  前端构建产物
data/                    运行数据（自动生成）
.github/workflows/       镜像构建与发布流程
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
| `GET` | `/api/health` | 存活检查，包含 `engineReady` 和内置 HTTPS 状态（`https`：是否启动、证书域名与到期时间）；本机 miaospeed 已启用但未就绪时 `status` 为 `degraded`（HTTP 仍为 200） |
| `GET` | `/api/ready` | 就绪检查：本机 miaospeed 已启用但未就绪时返回 503；Docker `HEALTHCHECK` 使用此接口 |
| `GET` | `/api/auth/session` | 查询登录状态 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET` | `/api/nodes/public` | 节点状态、在线率与解锁结果，仍需登录；`?probe=<后端ID>` 查看指定探针，多个后端时每个节点附带 `probes` 对比 |
| `POST` | `/api/nodes/reload` | 重新加载来源 |
| `POST` | `/api/nodes/check` | 执行一轮巡检；请求体可传 `{"reload":true}` 先刷新来源 |
| `POST` | `/api/nodes/media-check` | 创建解锁检测任务；请求体可传 `{"nodeIds":["节点ID"],"probeId":"后端ID"}`，空数组检测全部 |
| `GET` | `/api/nodes/jobs` | 查询巡检和解锁检测任务进度 |
| `GET` | `/api/unlock` | 解锁脚本目录、当前选择的列与默认列 |
| `PUT` | `/api/unlock` | 保存解锁检测设置：`{"scripts":["netflix","chatgpt"],"regional":true}`（最多 30 个） |
| `GET` | `/api/system/status` | 系统、来源、后端与任务状态 |
| `GET` | `/api/reports/latest.png` | 根据当前结果生成 PNG 报告；`?probe=<后端ID>` 指定探针 |
| `GET` | `/api/backends` | miaospeed 后端列表与状态（不含 token） |
| `POST` | `/api/backends` | 添加后端：`{"type":"reverse","name":"…"}` 返回连接地址、token 与部署命令（仅此一次）；`{"type":"forward","name":"…","url":"wss://…","token":"…","fingerprint":"可选","ca":"可选 PEM","clientCert":"可选 PEM","clientKey":"可选 PEM","servername":"可选","buildToken":"可选","monitor":true}` |
| `POST` | `/api/backends/mtls` | 生成一套 mTLS 证书（不保存）：`{"url":"wss://…"}` 或 `{"hosts":["域名或 IP"]}`，返回 `ca`、`serverCert`、`serverKey`、`clientCert`、`clientKey` |
| `POST` | `/api/backends/peek-cert` | 读取 `wss://` 后端当前的服务器证书（主体、签发者、有效期、SHA-256 指纹），用于固定指纹：`{"url":"wss://…"}` |
| `POST` | `/api/backends/:id/rotate` | 重置反向后端 token，返回新的部署命令 |
| `POST` | `/api/backends/:id/check` | 立即检查正向后端能否连接 |
| `PATCH` / `DELETE` | `/api/backends/:id` | `enabled`（启用 / 停用，`local` 为本机）、`monitor`（是否参与巡检）、改名、修改正向地址与 TLS 设置（字段不传则保持不变，传空字符串清除）；删除后端及其历史 |
| `GET` | `/api/deep-tests` | 当前任务、测试记录与可用后端 |
| `POST` | `/api/deep-tests` | 开始测试：`{"preset":"latency\|speed\|topology\|unlock","backendId":"…","sourceId":"…","include":"正则","exclude":"正则","options":{"modes":["download-single","download-multi","upload-single","upload-multi"],"duration":5,"multiThreads":8,"downloadSource":"auto","uploadSource":"auto"}}`（测速，`modes` 任选）；解锁测试可传 `"options":{"scripts":["netflix","chatgpt"]}` |
| `GET` / `DELETE` | `/api/deep-tests/:id` | 测试详情；删除测试记录 |
| `GET` | `/api/deep-tests/:id/report.png` | 测试报告 PNG；`?sort=rtt\|http\|speed` 排序，`&download=1` 下载 |
| `POST` | `/api/deep-tests/:id/cancel` | 停止正在运行的测试 |

## 常见问题

**树莓派拉取时提示 `no matching manifest for linux/arm64/v8`？**

所用镜像标签没有 ARM64 版本。先确认多架构工作流已完整发布成功，再检查镜像包含的平台：

```bash
docker buildx imagetools inspect ghcr.io/leoch627/node-watcher:latest
```

输出应同时包含 `linux/amd64` 和 `linux/arm64`。确认后在部署目录执行 `docker compose pull && docker compose up -d`；一键部署用户直接重新运行 `node-watcher.sh`，自定义目录需传入相同的 `--dir`。如果使用固定版本标签，请检查对应标签；旧标签不会因为 `latest` 更新而自动补齐架构。不要将树莓派的 `platform` 强制改为 `linux/amd64` 来绕过检查；无法等待镜像发布时，可使用「从源码构建」方式在树莓派本机构建。32 位系统（`armv7l`）无法运行主控镜像，只能作为探针。

**拉取预编译镜像提示 `denied` 或 `manifest unknown`？**

确认镜像名为 `ghcr.io/leoch627/node-watcher`、所用标签已发布，并检查对应 GitHub Actions 是否成功。匿名拉取需要 GHCR 软件包设为公开；私有软件包需使用有读取权限的账号先执行 `docker login ghcr.io`。

**容器提示未设置 `AUTH_PASSWORD`，无法启动？**

确认已在仓库根目录创建 `.env`，并填入非空密码。默认 Compose 会在启动前检查该变量。

**网页可以访问，但节点一直「待检测」或巡检被跳过？**

巡检只在在线的 miaospeed 后端上运行。查看「设置 → miaospeed 后端」各后端的状态，以及 `/api/ready`（本机 miaospeed 未就绪时为 503）。源码运行时确认已执行 `npm run setup:bin` 或设置了 `MIAOSPEED_BIN`；本机 miaospeed 异常退出会自动重启，日志中以 `[miaospeed]` 开头的行是它的输出。设置了 `MIAOSPEED_LOCAL=false` 时，至少需要一个在线的正向或反向后端。

**反向后端一直显示离线？**

在探针机器上查看 miaospeed 的日志（例如 `docker logs miaospeed`），并逐项检查：

- 地址：必须是面板给出的完整地址 `wss://你的域名/miaospeed/reverse/<ID>`，域名能在探针机器上解析，主控 443 端口可访问。面板给出的是 `ws://` 或内网地址时，设置 `MIAOSPEED_PUBLIC_URL=wss://你的域名`（一键脚本的域名模式会自动设置）后重新添加或重置 token 获取新命令。
- token：token 不符时主控日志会记录 `miaospeed reverse link ... rejected` 及原因；重置 token 后旧命令立即失效，已停用或删除的后端直接拒绝连接。用面板给出的新命令重新部署。
- 证书：miaospeed 只接受公认 CA 签发且与域名匹配的证书，自签证书、过期证书或域名不符都会导致 TLS 握手失败；用浏览器打开 `https://你的域名` 确认证书正常。
- 反向代理：自建 Nginx 等反向代理时，确认已转发 WebSocket 升级请求。

**证书申请失败？**

- HTTP 验证：确认域名的 A / AAAA 记录指向本机公网 IP（解析刚修改时需等待生效），防火墙和云安全组已放行 TCP 80，80 端口没有被其他程序（如已有的 Nginx）占用；家宽通常封锁 80 端口，请改用 DNS 验证。
- DNS 验证：确认导出的环境变量名称与服务商对应（区分大小写，见「域名与 HTTPS 证书」），API 凭据有该域名的 DNS 修改权限（如 Cloudflare API Token 需要 Zone → DNS → Edit）。
- 证书已签发但 HTTPS 没有启动时，看 `/api/health` 的 `https.error`。查看 acme 容器日志：`docker compose --project-name node-watcher --env-file .env -f compose.deploy.yml logs acme`。修正后在菜单「证书管理」中重新申请。Let's Encrypt 对同一域名的失败验证次数有频率限制，多次失败后请等待一段时间再试。

**测速用了很多流量？**

深度测试的「测速」会真实下载文件，每个节点约消耗「时长 × 带宽」，千兆节点测 5 秒约 600 MB，节点多时总量很大，流量同时计入机场套餐和执行测试的机器。请按需手动运行，缩短时长、用名称正则只测部分节点；定时巡检和解锁检测不测速，流量很小。

**修改 `.env` 中的检测周期或通知配置没有生效？**

已有配置文件不会被这些环境变量覆盖，默认 Compose 也没有传入这些变量。请在面板中修改对应设置并保存。

**重启后解锁结果消失？**

解锁结果不持久化，请重新触发解锁检测。检测出错时会保留同一进程内上次成功的结果。PNG 报告根据当前内存中的结果生成，不是历史报告归档；深度测试的结果会保存在 `data/deep-tests/`。

**从旧版本升级后，原来的探针不再工作？**

探针现在就是 miaospeed 后端，旧版的 Node Watcher 探针容器不再受支持。在主控「设置 → miaospeed 后端」添加反向后端，按「部署反向探针」在探针机器上部署 miaospeed（一键脚本会自动移除旧的探针容器）。主控本机的在线率历史（`data/history.json`）会保留；新版首次启动时自动清理旧探针留下的配置记录、各探针历史文件（`data/history-p-*.json`）、旧探针证书（`data/probe-tls/`）和 mihomo 工作目录（`data/mihomo/`），日志中会列出清理了哪些内容。

**GitHub Actions 推送镜像时报 `denied: permission_denied: write_package`？**

GHCR 上的 `node-watcher` 镜像包没有授权给当前仓库（常见于删除后重建同名仓库）。到 GitHub 个人主页 → Packages → `node-watcher` → Package settings → Manage Actions access，添加本仓库并设为 Write，然后在 Actions 页面重新运行失败的工作流；或者删除该镜像包，让工作流重新创建。

## 许可证与致谢

本项目采用 **AGPL-3.0-only** 许可证，完整条款见 [LICENSE](LICENSE)。

- 检测引擎为 [AirportR/miaospeed](https://github.com/AirportR/miaospeed)（AGPL-3.0），Docker 镜像和 `npm run setup:bin` 安装未经修改的官方发布版。
- 解锁检测脚本来自 [CloudPassenger/miaospeed-scripts](https://github.com/CloudPassenger/miaospeed-scripts) v1.0.0（AGPL-3.0），未经修改随项目附带于 `src/assets/miaospeed-scripts/`。
- 报告中的国旗图形来自 [Twemoji](https://github.com/jdecked/twemoji)（CC-BY 4.0）。
- 报告版式参考 Koipy 和 [FullTClash](https://github.com/AirportR/fulltclash) 的结果图。

来源、版本与校验值见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
