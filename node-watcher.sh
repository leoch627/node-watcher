#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'HELP'
用法：bash node-watcher.sh [install|update] [选项]
      bash node-watcher.sh [部署目录 [端口 [用户名 [密码]]]]
  -d, --dir PATH       部署目录，默认 /opt/node-watcher
  -p, --port PORT      对外端口（1-65535），首次默认随机选择 1000-10000
  -u, --username USER  登录用户名，默认 admin
  -P, --password PASS  登录密码，首次默认随机生成
      --no-install    不自动安装依赖（适合已配置 Docker 的 NAS）
  -h, --help          显示帮助
无参数直接安装。重复运行会更新镜像，只有显式传入的设置会覆盖已有值。
示例：bash node-watcher.sh -d /opt/node-watcher -p 8080 -u admin -P 'My$Password!'
支持 Linux x86_64 / ARM64；缺少依赖时自动安装，需要 root 或 sudo。
默认国内加速：GitHub 使用 ghfast.top，Docker CE 使用清华源，镜像使用毫秒镜像 1ms.run。
HELP
}

original_args=("$@")
deploy_dir=/opt/node-watcher
port_override=''
username_override=''
password_override=''
auto_install=true
positional=0
named_options=false
[[ "${1:-}" != install && "${1:-}" != update ]] || shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --no-install) auto_install=false; shift ;;
    -d|--dir|-p|--port|-u|--username|-P|--password|--dir=*|--port=*|--username=*|--password=*)
      [[ $positional -eq 0 ]] || fail '请勿混用位置参数与命名参数。'
      named_options=true
      option=${1%%=*}
      if [[ "$1" == *=* ]]; then
        value=${1#*=}; shift
      else
        [[ $# -ge 2 ]] || fail "${1} 缺少参数值。"
        value=$2; shift 2
      fi
      [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "${option} 不能是空值或包含换行。"
      case "$option" in
        -d|--dir) deploy_dir=$value ;;
        -p|--port) port_override=$value ;;
        -u|--username) username_override=$value ;;
        -P|--password) password_override=$value ;;
      esac
      ;;
    -*) fail "未知选项：$1；使用 --help 查看用法。" ;;
    *)
      [[ "$named_options" == false ]] || fail '请勿混用位置参数与命名参数。'
      [[ -n "$1" && "$1" != *$'\n'* && "$1" != *$'\r'* ]] || fail '参数不能是空值或包含换行。'
      positional=$((positional + 1))
      case "$positional" in
        1) deploy_dir=$1 ;;
        2) port_override=$1 ;;
        3) username_override=$1 ;;
        4) password_override=$1 ;;
        *) fail '最多接受部署目录、端口、用户名、密码四个位置参数。' ;;
      esac
      shift
      ;;
  esac
done

validate_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || fail '端口必须为 1-65535 的整数。'
  (( 10#$1 >= 1 && 10#$1 <= 65535 )) || fail '端口必须为 1-65535 的整数。'
}
if [[ -n "$port_override" ]]; then
  validate_port "$port_override"
  port_override=$((10#$port_override))
fi
[[ "$(uname -s)" == Linux ]] || fail '请在 Linux 服务器、NAS 或树莓派上运行。'
case "$(uname -m)" in
  x86_64|amd64) compose_arch=x86_64 ;;
  aarch64|arm64) compose_arch=aarch64 ;;
  *) fail "镜像支持 x86_64 / ARM64，当前系统架构 $(uname -m) 不支持；树莓派请使用 64 位系统。" ;;
esac
if [[ "$(id -u)" != 0 ]]; then
  if command -v sudo >/dev/null 2>&1 && [[ -f "$0" ]]; then
    exec sudo -E bash "$0" "${original_args[@]}"
  fi
  fail '请切换到 root 后运行，或下载脚本后使用 sudo bash node-watcher.sh。'
fi

temporary_file=''
download_dir=''
trap 'if [[ -n "$temporary_file" ]]; then rm -f -- "$temporary_file"; fi; if [[ -n "$download_dir" ]]; then rm -rf -- "$download_dir"; fi' EXIT

install_packages() {
  [[ "$auto_install" == true ]] || fail "缺少依赖：$*；请安装后重试，或去掉 --no-install。"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache "$@"
  elif command -v pacman >/dev/null 2>&1; then
    pacman -S --needed --noconfirm "$@"
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install "$@"
  else
    fail "无法自动安装依赖：$*；请通过设备的软件中心安装后重试。"
  fi
}

download() {
  local url="$1"
  case "$url" in
    https://github.com/*|https://raw.githubusercontent.com/*) url="https://ghfast.top/$url" ;;
  esac
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 20 -o "$2" "$url"
  else
    wget -O "$2" "$url"
  fi
}

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  install_packages ca-certificates curl
fi
command -v openssl >/dev/null 2>&1 || install_packages openssl
for command_name in awk mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || fail "缺少 ${command_name}，请先安装后重试。"
done

if ! command -v docker >/dev/null 2>&1; then
  [[ "$auto_install" == true ]] || fail '未安装 Docker，请安装后重试，或去掉 --no-install。'
  printf '正在安装 Docker……\n'
  if command -v apk >/dev/null 2>&1; then
    install_packages docker docker-cli-compose
  elif command -v pacman >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1; then
    install_packages docker docker-compose
  else
    download_dir=$(mktemp -d "${TMPDIR:-/tmp}/node-watcher.XXXXXX")
    download https://raw.githubusercontent.com/docker/docker-install/master/install.sh "$download_dir/install-docker.sh" || fail 'Docker 安装脚本下载失败，请检查 ghfast.top 连接。'
    DOWNLOAD_URL=https://mirrors.tuna.tsinghua.edu.cn/docker-ce sh "$download_dir/install-docker.sh" || fail 'Docker 自动安装失败，请检查系统版本、清华软件源及网络，或手动安装 Docker 后重试。'
  fi
fi

if [[ -n "${DOCKER_HOST:-}" ]]; then
  docker_endpoint=$DOCKER_HOST
else
  docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null) || docker_endpoint=unix:///var/run/docker.sock
fi
[[ "$docker_endpoint" == unix://* ]] || fail '请使用本机 Docker Unix socket，脚本不支持远程 Docker 主机。'
if ! docker info >/dev/null 2>&1; then
  printf '正在启动 Docker 服务……\n'
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    systemctl enable --now docker || true
  elif command -v rc-service >/dev/null 2>&1; then
    rc-update add docker default || true
    rc-service docker start || true
  elif command -v service >/dev/null 2>&1; then
    service docker start || true
  fi
  for ((attempt = 0; attempt < 30; attempt++)); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
daemon_platform=$(docker info --format '{{.OSType}}/{{.Architecture}}') || fail '无法连接 Docker；NAS 请在软件中心启动 Docker / Container Manager，LXC 请启用嵌套容器支持。'
case "$daemon_platform" in
  linux/amd64|linux/x86_64|linux/arm64|linux/aarch64) ;;
  *) fail "不支持 Docker 平台 ${daemon_platform}；需要 Linux AMD64 或 ARM64。" ;;
esac
security_options=$(docker info --format '{{json .SecurityOptions}}')
case "$security_options" in
  *rootless*|*userns*) fail '此脚本的目录权限设置仅适用于 rootful Docker，rootless / userns 请按 README 手动部署。' ;;
esac

configure_registry_mirror() {
  local config_file="${NODE_WATCHER_DOCKER_CONFIG:-/etc/docker/daemon.json}"
  local config_dir source_file backup_file mirrors attempt
  [[ "$config_file" == /* ]] || fail 'NODE_WATCHER_DOCKER_CONFIG 必须为绝对路径。'
  [[ ! -L "$config_file" && ( ! -e "$config_file" || -f "$config_file" ) ]] || fail "${config_file} 必须是普通文件，不能是符号链接。"
  command -v jq >/dev/null 2>&1 || install_packages jq
  config_dir=${config_file%/*}
  mkdir -p "$config_dir"
  source_file=$config_file
  if [[ ! -e "$config_file" ]]; then
    [[ -n "$download_dir" ]] || download_dir=$(mktemp -d "${TMPDIR:-/tmp}/node-watcher.XXXXXX")
    source_file="$download_dir/daemon-empty.json"
    printf '{}\n' > "$source_file"
  fi
  temporary_file=$(mktemp "${config_dir}/.daemon.json.XXXXXX")
  # Merge structured JSON so storage, networking and other registry settings survive.
  jq -e -s '
    if length != 1 or (.[0] | type) != "object" then error("daemon.json must contain one object") else .[0] end
    | if has("registry-mirrors") and ((.["registry-mirrors"] | type) != "array")
      then error("registry-mirrors must be an array") else . end
    | if any(.["registry-mirrors"][]?; type != "string")
      then error("registry-mirrors entries must be strings") else . end
    | .["registry-mirrors"] = (["https://docker.1ms.run"] +
        ((.["registry-mirrors"] // []) | map(select(. != "https://docker.1ms.run" and . != "https://docker.1ms.run/"))))
  ' "$source_file" > "$temporary_file" || fail "${config_file} 不是有效的 Docker JSON 配置，原文件未修改。"
  if command -v dockerd >/dev/null 2>&1; then
    dockerd --validate --config-file "$temporary_file" >/dev/null || fail 'Docker 配置校验失败，原文件未修改。'
  fi
  if [[ -f "$config_file" ]] && jq -e --slurpfile updated "$temporary_file" '. == $updated[0]' "$config_file" >/dev/null; then
    rm -f -- "$temporary_file"
  else
    if [[ -f "$config_file" ]]; then
      backup_file=$(mktemp "${config_file}.node-watcher-backup.XXXXXX")
      cp -p -- "$config_file" "$backup_file"
      printf 'Docker 原配置备份：%s\n' "$backup_file"
    fi
    mv -- "$temporary_file" "$config_file"
  fi
  temporary_file=''
  mirrors=$(docker info --format '{{json .RegistryConfig.Mirrors}}') || mirrors='[]'
  if ! printf '%s\n' "$mirrors" | jq -e '.[0] == "https://docker.1ms.run/" or .[0] == "https://docker.1ms.run"' >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
      systemctl reload docker || true
    elif command -v rc-service >/dev/null 2>&1; then
      rc-service docker reload || true
    elif command -v service >/dev/null 2>&1; then
      service docker reload || true
    fi
    for ((attempt = 0; attempt < 5; attempt++)); do
      mirrors=$(docker info --format '{{json .RegistryConfig.Mirrors}}') || mirrors='[]'
      if printf '%s\n' "$mirrors" | jq -e '.[0] == "https://docker.1ms.run/" or .[0] == "https://docker.1ms.run"' >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if [[ $attempt -eq 5 ]]; then
      printf 'Docker Hub 加速配置已写入 %s，但守护进程尚未加载；请通过系统或 NAS 管理界面重新加载 Docker，或核对其实际配置文件路径。\n本次 Node Watcher 将直接通过 ghcr.1ms.run 拉取镜像。\n' "$config_file" >&2
      return 0
    fi
  fi
  printf 'Docker Hub 镜像加速已启用：毫秒镜像 https://docker.1ms.run\n'
}
configure_registry_mirror

if docker compose version >/dev/null 2>&1; then
  compose_command=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version --short 2>/dev/null | awk '/^v?[2-9]\./ { ok=1 } END { exit !ok }'; then
  compose_command=(docker-compose)
else
  [[ "$auto_install" == true ]] || fail '需要 Compose v2 或更新版本（docker compose / docker-compose），去掉 --no-install 可自动安装。'
  printf '正在安装 Docker Compose（%s）……\n' "$compose_arch"
  [[ -n "$download_dir" ]] || download_dir=$(mktemp -d "${TMPDIR:-/tmp}/node-watcher.XXXXXX")
  compose_url="https://github.com/docker/compose/releases/download/v5.5.0/docker-compose-linux-${compose_arch}"
  download "$compose_url" "$download_dir/docker-compose" || fail 'Compose 下载失败，请检查 GitHub 连接。'
  download "${compose_url}.sha256" "$download_dir/docker-compose.sha256" || fail 'Compose 校验文件下载失败。'
  expected_hash=$(awk '{print $1; exit}' "$download_dir/docker-compose.sha256")
  actual_hash=$(openssl dgst -sha256 "$download_dir/docker-compose" | awk '{print $NF}')
  [[ "$expected_hash" =~ ^[a-fA-F0-9]{64}$ && "$actual_hash" == "$expected_hash" ]] || fail 'Compose SHA256 校验失败。'
  mkdir -p /usr/local/lib/docker/cli-plugins
  install -m 755 "$download_dir/docker-compose" /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose version >/dev/null 2>&1 || fail 'Compose 安装后无法运行，请检查系统架构和 Docker CLI 版本。'
  compose_command=(docker compose)
fi

mkdir -p "$deploy_dir"
cd "$deploy_dir"
deploy_dir=$(pwd -P)

for managed_path in .env compose.deploy.yml data logs; do
  [[ ! -L "$managed_path" ]] || fail "${deploy_dir}/${managed_path} 是符号链接，停止以避免修改其他路径。"
done
[[ ! -e .env || -f .env ]] || fail '.env 必须是普通文件。'
[[ ! -e compose.deploy.yml || -f compose.deploy.yml ]] || fail 'compose.deploy.yml 必须是普通文件。'

touch .env
chmod 600 .env

read_setting() {
  awk -v key="$1" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" {
      value = $0
      sub(/^[^=]*=[[:space:]]*/, "", value)
      sub(/[[:space:]]+$/, "", value)
    }
    END { print value }
  ' .env
}

setting_missing() {
  local current
  current=$(read_setting "$1")
  case "$current" in
    ''|'""'|"''"|\#*|'"" #'*|"'' #"*) return 0 ;;
    *) return 1 ;;
  esac
}

set_setting() {
  local key="$1" value="$2"
  # Escape dotenv strings and Compose interpolation, including trailing backslashes.
  if [[ "$key" == AUTH_USERNAME || "$key" == AUTH_PASSWORD ]]; then
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//\$/\$\$}
    value="\"$value\""
  fi
  temporary_file=$(mktemp "${deploy_dir}/.env.XXXXXX")
  awk -v key="$key" '$0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*="' .env > "$temporary_file"
  printf '%s=%s\n' "$key" "$value" >> "$temporary_file"
  mv -- "$temporary_file" .env
  temporary_file=''
}

generated_password=''
ensure_setting() {
  local key="$1" value="$2"
  setting_missing "$key" || return 0
  if [[ "$value" == 'random-password' ]]; then
    value=$(openssl rand -hex 18)
    generated_password=$value
  elif [[ "$value" == 'random-secret' ]]; then
    value=$(openssl rand -hex 32)
  fi
  set_setting "$key" "$value"
}

port_in_use() {
  local port="$1" listeners hex_port published
  if command -v ss >/dev/null 2>&1 && listeners=$(ss -H -ltn 2>/dev/null); then
    if printf '%s\n' "$listeners" | awk -v port="$port" '$4 ~ ":" port "$" { found=1 } END { exit !found }'; then
      return 0
    fi
  else
    hex_port=$(printf '%04X' "$port")
    for socket_file in /proc/net/tcp /proc/net/tcp6; do
      if [[ -r "$socket_file" ]] && awk -v port="$hex_port" '$2 ~ ":" port "$" && $4 == "0A" { found=1 } END { exit !found }' "$socket_file"; then
        return 0
      fi
    done
  fi
  published=$(docker ps --format '{{.Ports}}') || fail '无法读取 Docker 已发布端口。'
  printf '%s\n' "$published" | awk -v port="$port" '
    {
      count = split($0, bindings, ",")
      for (i = 1; i <= count; i++) {
        if (bindings[i] !~ /->/) continue
        sub(/->.*/, "", bindings[i])
        sub(/^.*:/, "", bindings[i])
        split(bindings[i], bounds, "-")
        first = bounds[1] + 0
        last = (bounds[2] == "" ? first : bounds[2] + 0)
        if (port >= first && port <= last) found = 1
      }
    }
    END { exit !found }
  '
}

if [[ -n "$port_override" ]]; then
  old_port=$(read_setting PORT)
  old_port=${old_port//\"/}
  old_port=${old_port//\'/}
  if [[ "$port_override" != "$old_port" ]] && port_in_use "$port_override"; then
    fail "端口 ${port_override} 已被占用，请用 --port 指定其他端口。"
  fi
  set_setting PORT "$port_override"
elif setting_missing PORT; then
  selected_port=''
  for ((attempt = 0; attempt < 100; attempt++)); do
    candidate=$RANDOM
    (( candidate < 27003 )) || continue
    candidate=$((1000 + candidate % 9001))
    if ! port_in_use "$candidate"; then
      selected_port=$candidate
      break
    fi
  done
  [[ -n "$selected_port" ]] || fail '未找到 1000-10000 范围内的可用端口，请用 --port 指定。'
  set_setting PORT "$selected_port"
fi
[[ -z "$username_override" ]] || set_setting AUTH_USERNAME "$username_override"
[[ -z "$password_override" ]] || set_setting AUTH_PASSWORD "$password_override"

case "$(read_setting NODE_WATCHER_IMAGE)" in
  ghcr.io/leoch627/node-watcher:latest|'"ghcr.io/leoch627/node-watcher:latest"'|"'ghcr.io/leoch627/node-watcher:latest'")
    set_setting NODE_WATCHER_IMAGE ghcr.1ms.run/leoch627/node-watcher:latest ;;
esac
ensure_setting NODE_WATCHER_IMAGE ghcr.1ms.run/leoch627/node-watcher:latest
ensure_setting AUTH_USERNAME admin
ensure_setting AUTH_PASSWORD random-password
ensure_setting AUTH_SESSION_SECRET random-secret
ensure_setting AUTH_SESSION_TTL_HOURS 24
ensure_setting AUTH_COOKIE_SECURE false
ensure_setting TRUST_PROXY 0
ensure_setting MIHOMO_HTTP_PORT 23333
ensure_setting MIHOMO_SOCKS_PORT 23334
ensure_setting MIHOMO_CONTROLLER_PORT 23335
ensure_setting MIHOMO_SECRET random-secret
volume_label=''
[[ "$security_options" != *selinux* ]] || volume_label=:Z
ensure_setting NODE_WATCHER_VOLUME_LABEL "$volume_label"

temporary_file=$(mktemp "${deploy_dir}/.compose.XXXXXX")
cat > "$temporary_file" <<'COMPOSE'
services:
  node-watcher:
    image: ${NODE_WATCHER_IMAGE:-ghcr.1ms.run/leoch627/node-watcher:latest}
    container_name: node-watcher
    ports:
      - "${PORT:?PORT must not be empty}:3000"
    volumes:
      - ./data:/app/data${NODE_WATCHER_VOLUME_LABEL:-}
      - ./logs:/app/logs${NODE_WATCHER_VOLUME_LABEL:-}
    environment:
      NODE_ENV: production
      PORT: 3000
      AUTH_USERNAME: ${AUTH_USERNAME:-admin}
      AUTH_PASSWORD: ${AUTH_PASSWORD:?AUTH_PASSWORD must not be empty}
      AUTH_SESSION_SECRET: ${AUTH_SESSION_SECRET:?AUTH_SESSION_SECRET must not be empty}
      AUTH_SESSION_TTL_HOURS: ${AUTH_SESSION_TTL_HOURS:-24}
      AUTH_COOKIE_SECURE: ${AUTH_COOKIE_SECURE:-false}
      TRUST_PROXY: ${TRUST_PROXY:-0}
      MIHOMO_HTTP_PORT: ${MIHOMO_HTTP_PORT:-23333}
      MIHOMO_SOCKS_PORT: ${MIHOMO_SOCKS_PORT:-23334}
      MIHOMO_CONTROLLER_PORT: ${MIHOMO_CONTROLLER_PORT:-23335}
      MIHOMO_SECRET: ${MIHOMO_SECRET:?MIHOMO_SECRET must not be empty}
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
COMPOSE
mv -- "$temporary_file" compose.deploy.yml
temporary_file=''

unset NODE_WATCHER_IMAGE PORT AUTH_USERNAME AUTH_PASSWORD AUTH_SESSION_SECRET
unset AUTH_SESSION_TTL_HOURS AUTH_COOKIE_SECURE TRUST_PROXY
unset MIHOMO_HTTP_PORT MIHOMO_SOCKS_PORT MIHOMO_CONTROLLER_PORT MIHOMO_SECRET
unset DOCKER_DEFAULT_PLATFORM
unset NODE_WATCHER_VOLUME_LABEL
compose=("${compose_command[@]}" --project-name node-watcher --env-file "$deploy_dir/.env" -f "$deploy_dir/compose.deploy.yml")
"${compose[@]}" config --quiet

printf '部署目录：%s\nDocker 平台：%s\n正在拉取预编译镜像……\n' "$deploy_dir" "$daemon_platform"
if ! "${compose[@]}" pull; then
  fail "镜像拉取失败，未启动或替换容器。若提示 no matching manifest，请确认 ARM64 多架构镜像已发布；若提示 denied、限流或超时，请检查毫秒镜像 ghcr.1ms.run 的访问限制及上游镜像发布状态。配置已保留在 ${deploy_dir}/.env，可修改 NODE_WATCHER_IMAGE 后重试。"
fi

mkdir -p data logs
chown -R 1000:1000 data logs
chmod 700 data logs

# Inspect health ourselves so older Compose v2 installations work without --wait.
started=false
if "${compose[@]}" up -d --no-build; then
  for ((attempt = 0; attempt < 60; attempt++)); do
    container_state=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' node-watcher) || break
    case "$container_state" in
      'running healthy') started=true; break ;;
      *unhealthy*|exited*|dead*) break ;;
    esac
    sleep 2
  done
fi
if [[ "$started" != true ]]; then
  printf '容器未能在等待时间内正常启动，请检查以下日志：\n' >&2
  "${compose[@]}" logs --tail=80 >&2 || true
  fail "启动失败，配置和数据已保留。请修复日志中的问题后重试。"
fi

"${compose[@]}" ps
server_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="src") {print $(i+1); exit}}') || server_ip=''
if [[ -z "$server_ip" ]]; then
  server_ip=$(hostname -I 2>/dev/null | awk '{print $1}') || server_ip=''
fi
server_ip=${server_ip:-服务器IP}
[[ "$server_ip" != *:* ]] || server_ip="[$server_ip]"
login_username=$(docker exec node-watcher printenv AUTH_USERNAME) || login_username='请查看 .env 中的 AUTH_USERNAME'
public_port=$(docker port node-watcher 3000/tcp | awk -F: 'NR == 1 {print $NF}') || public_port=''
public_port=${public_port:-$(read_setting PORT)}
printf '\n部署完成。\n访问地址：http://%s:%s\n用户名：%s\n' "$server_ip" "$public_port" "$login_username"
if [[ -n "$generated_password" ]]; then
  printf '随机登录密码：%s\n请妥善保存，不要将其公开。\n' "$generated_password"
elif [[ -n "$password_override" ]]; then
  printf '登录密码：使用 --password 传入的密码。\n'
else
  printf '登录密码：保留已有密码，可在下方 .env 文件中查看 AUTH_PASSWORD。\n'
fi
printf '配置文件：%s/.env（权限 600）\n' "$deploy_dir"
printf '更新镜像：重新运行本脚本，已有密码和数据不会被重置。\n'
printf '请在服务器防火墙 / 云安全组中放行上方 TCP 端口；公网访问请将服务器IP换为公网地址。\n'
printf '查看日志：'
printf '%q ' "${compose[@]}"
printf 'logs -f --tail=100\n'
