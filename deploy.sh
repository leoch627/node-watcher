#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  printf '用法：sudo bash deploy.sh [部署目录]\n默认目录：/opt/node-watcher\n需要：Linux、Docker Compose v2、OpenSSL，以及本机 rootful Docker。\n重复运行会更新镜像，保留已有密码、设置和数据。\n'
  exit 0
fi

[[ $# -le 1 ]] || fail '只接受一个部署目录参数。'
[[ "$(uname -s)" == 'Linux' ]] || fail '此脚本面向 Linux 服务器和 64 位树莓派。'
[[ "$(id -u)" == '0' ]] || fail '请使用 sudo bash deploy.sh，或切换到 root 后运行。'

for command_name in docker openssl awk mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || fail "缺少 ${command_name}，请先安装后重试。"
done

docker compose version >/dev/null 2>&1 || fail '需要 Docker Compose v2（docker compose）。'
daemon_platform=$(docker info --format '{{.OSType}}/{{.Architecture}}') || fail '无法连接 Docker，请先启动 Docker 服务。'
case "$daemon_platform" in
  linux/amd64|linux/x86_64|linux/arm64|linux/aarch64) ;;
  *) fail "不支持 Docker 平台 ${daemon_platform}；需要 Linux AMD64 或 ARM64。" ;;
esac
security_options=$(docker info --format '{{json .SecurityOptions}}')
case "$security_options" in
  *rootless*|*userns*) fail '此脚本的目录权限设置仅适用于 rootful Docker，rootless / userns 请按 README 手动部署。' ;;
esac
docker_endpoint=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}
[[ "$docker_endpoint" == unix://* ]] || fail '请使用本机 Docker Unix socket，脚本不支持远程 Docker 主机。'

deploy_dir=${1:-/opt/node-watcher}
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
temporary_file=''
trap 'if [[ -n "$temporary_file" ]]; then rm -f -- "$temporary_file"; fi' EXIT

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

generated_password=''
ensure_setting() {
  local key="$1" value="$2" current
  current=$(read_setting "$key")
  case "$current" in
    ''|'""'|"''"|\#*|'"" #'*|"'' #"*) ;;
    *) return ;;
  esac
  if [[ "$value" == 'random-password' ]]; then
    value=$(openssl rand -hex 18)
    generated_password=$value
  elif [[ "$value" == 'random-secret' ]]; then
    value=$(openssl rand -hex 32)
  fi
  temporary_file=$(mktemp "${deploy_dir}/.env.XXXXXX")
  awk -v key="$key" -v value="$value" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" {
      if (!written) print key "=" value
      written = 1
      next
    }
    { print }
    END { if (!written) print key "=" value }
  ' .env > "$temporary_file"
  mv -- "$temporary_file" .env
  temporary_file=''
}

ensure_setting NODE_WATCHER_IMAGE ghcr.io/leoch627/node-watcher:latest
ensure_setting PORT 3000
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

temporary_file=$(mktemp "${deploy_dir}/.compose.XXXXXX")
cat > "$temporary_file" <<'COMPOSE'
services:
  node-watcher:
    image: ${NODE_WATCHER_IMAGE:-ghcr.io/leoch627/node-watcher:latest}
    container_name: node-watcher
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
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
compose=(docker compose --project-name node-watcher --env-file "$deploy_dir/.env" -f "$deploy_dir/compose.deploy.yml")
"${compose[@]}" config --quiet

printf '部署目录：%s\nDocker 平台：%s\n正在拉取预编译镜像……\n' "$deploy_dir" "$daemon_platform"
if ! "${compose[@]}" pull; then
  fail "镜像拉取失败，未启动或替换容器。若提示 no matching manifest，请等待 ARM64 多架构镜像发布完成；若提示 denied，请检查 GHCR 权限。配置已保留在 ${deploy_dir}/.env，可直接重试。"
fi

mkdir -p data logs
chown -R 1000:1000 data logs
chmod 700 data logs

if ! "${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 120; then
  printf '容器未能在等待时间内正常启动，请检查以下日志：\n' >&2
  "${compose[@]}" logs --tail=80 >&2 || true
  fail "启动失败，配置和数据已保留。请修复日志中的问题后重试。"
fi

"${compose[@]}" ps
server_ip=$(hostname -I 2>/dev/null | awk '{print $1}') || server_ip=''
server_ip=${server_ip:-服务器IP}
printf '\n部署完成。\n访问地址：http://%s:%s\n用户名：%s\n' "$server_ip" "$(read_setting PORT)" "$(read_setting AUTH_USERNAME)"
if [[ -n "$generated_password" ]]; then
  printf '随机登录密码：%s\n请妥善保存，不要将其公开。\n' "$generated_password"
else
  printf '登录密码：保留已有密码，可在下方 .env 文件中查看 AUTH_PASSWORD。\n'
fi
printf '配置文件：%s/.env（权限 600）\n' "$deploy_dir"
printf '更新镜像：重新运行本脚本，已有密码和数据不会被重置。\n'
printf '查看日志：docker compose --project-name node-watcher --env-file %q -f %q logs -f --tail=100\n' "$deploy_dir/.env" "$deploy_dir/compose.deploy.yml"
