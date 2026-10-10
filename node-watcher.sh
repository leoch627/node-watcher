#!/usr/bin/env bash
# Node Watcher 一键安装 / 管理脚本（node-watcher.sh）
# 交互菜单：bash node-watcher.sh；主控：bash node-watcher.sh [install|update] [选项]；
# 探针：bash node-watcher.sh probe --connect 'wss://…/miaospeed/reverse/<ID>' --token '<token>'。详见 --help。
set -euo pipefail
umask 077

script_version=2.0.0
project_url=https://github.com/leoch627/node-watcher
script_url=https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh
default_master_dir=/opt/node-watcher
default_probe_dir=/opt/node-watcher-probe
default_master_image=ghcr.1ms.run/leoch627/node-watcher:latest
default_miaospeed_image=airportr/miaospeed:4.7.8
default_acme_image=neilpang/acme.sh:3.1.5
hub_mirror=docker.1ms.run
shortcut_path=${NODE_WATCHER_SHORTCUT:-/usr/local/bin/nw}
shortcut_name=${shortcut_path##*/}

use_color=false
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then use_color=true; fi

say() {
  local tone=$1 code=''
  shift
  if [[ "$use_color" == true ]]; then
    case "$tone" in
      red) code='31' ;;
      green) code='32' ;;
      yellow) code='33' ;;
      skyBlue) code='1;36' ;;
    esac
  fi
  if [[ -n "$code" ]]; then
    printf '\033[%sm%s\033[0m\n' "$code" "$*"
  else
    printf '%s\n' "$*"
  fi
}

fail() {
  if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
    printf '\033[31m错误：%s\033[0m\n' "$*" >&2
  else
    printf '错误：%s\n' "$*" >&2
  fi
  exit 1
}

warn() {
  if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
    printf '\033[33m%s\033[0m\n' "$*" >&2
  else
    printf '%s\n' "$*" >&2
  fi
}

usage() {
  cat <<'HELP'
用法：bash node-watcher.sh                                   在终端中直接运行：打开交互式安装 / 管理菜单
      bash node-watcher.sh menu                              强制打开菜单
      bash node-watcher.sh [install|update] [选项]           部署 / 更新主控（面板）
      bash node-watcher.sh [部署目录 [端口 [用户名 [密码]]]]
      bash node-watcher.sh probe --connect URL --token TOKEN [选项]   部署 / 更新探针（miaospeed）
主控选项：
  -d, --dir PATH          部署目录，默认 /opt/node-watcher
  -p, --port PORT         面板对外端口（1-65535），首次默认随机选择 1000-10000；使用域名时不需要
  -u, --username USER     登录用户名，默认 admin
  -P, --password PASS     登录密码，首次默认随机生成
      --domain DOMAIN     使用域名并自动申请 Let's Encrypt 证书：面板改走 80 / 443 端口并开启 HTTPS
                          （探针经公网反向连接主控时需要，miaospeed 只信任公共 CA 签发的证书）
      --acme http|dns     证书验证方式，默认 http（公网需能访问本机 80 端口）；dns 适合 NAT / 80 端口被封
      --dns-provider NAME acme.sh 的 DNS API 名称（不含 dns_ 前缀），如 cf、ali、dp、tencent、huaweicloud、gd、namesilo
      --acme-email EMAIL  证书账户邮箱（可选）
      --http-port PORT    域名模式的 HTTP 端口，默认 80（HTTP 验证需要公网 80 端口转发到这里）
      --https-port PORT   域名模式的 HTTPS 端口，默认 443（NAT 机器可改为映射到公网的端口）
      --no-domain         取消域名 / HTTPS，恢复为面板端口直连
探针选项（probe 子命令）：
      --connect URL       主控面板「设置 → miaospeed 后端」添加反向后端后给出的连接地址
                          （wss://主控域名/miaospeed/reverse/<ID>）
      --token TOKEN       同一处给出的 token；更新时可省略这两项，沿用已保存的值
  -d, --dir PATH          部署目录，默认 /opt/node-watcher-probe
      --name NAME         容器名称，默认 miaospeed
通用选项：
      --no-install        不自动安装依赖（适合已配置 Docker 的 NAS）
  -h, --help              显示帮助
DNS 验证的 API 凭据不要写在命令行里：先 export 对应的 acme.sh 环境变量，再以 root 或 sudo -E 运行：
  cf（Cloudflare）      CF_Token（可选 CF_Account_ID / CF_Zone_ID）
  ali（阿里云）         Ali_Key、Ali_Secret
  dp（DNSPod）          DP_Id、DP_Key
  tencent（腾讯云）     Tencent_SecretId、Tencent_SecretKey
  huaweicloud（华为云） HUAWEICLOUD_Username、HUAWEICLOUD_Password、HUAWEICLOUD_DomainName
  gd（GoDaddy）         GD_Key、GD_Secret
  namesilo              Namesilo_Key
  其他服务商            用 ACME_DNS_ENV="变量1 变量2" 指定要传给 acme.sh 的环境变量名
凭据只写入部署目录下的 acme.env（权限 600），仅证书容器读取，不会进入面板容器和 .env。
无参数运行：在终端中打开交互菜单；非交互环境（如 curl | bash）直接安装主控。
重复运行会更新镜像，只有显式传入的设置会覆盖已有值。
示例：bash node-watcher.sh -d /opt/node-watcher -p 8080 -u admin -P 'My$Password!'
      bash node-watcher.sh --domain monitor.example.com
      export CF_Token='…'; sudo -E bash node-watcher.sh --domain monitor.example.com --acme dns --dns-provider cf
      bash node-watcher.sh probe --connect 'wss://monitor.example.com/miaospeed/reverse/m-1a2b3c4d' --token '…'
主控支持 Linux x86_64 / ARM64，探针另支持 ARMv7 / x86；缺少依赖时自动安装，需要 root 或 sudo。
默认国内加速：GitHub 使用 ghfast.top，Docker CE 使用清华源，镜像使用毫秒镜像 1ms.run。
HELP
}

# ---------------------------------------------------------------------------------------------
# 参数解析
original_args=("$@")
original_count=$#
mode=master
deploy_dir=''
port_override=''
username_override=''
password_override=''
regenerate_password=false
domain_override=''
acme_mode_override=''
dns_provider_override=''
acme_email_override=''
http_port_override=''
https_port_override=''
no_domain=false
connect_override=''
token_override=''
probe_name_override=''
auto_install=true
positional=0
named_options=false
case "${1:-}" in
  install|update) shift ;;
  probe) mode=probe; shift ;;
  menu) mode=menu; shift ;;
esac
if [[ "$original_count" -eq 0 ]] && { [[ "${NODE_WATCHER_FORCE_MENU:-}" == 1 ]] || [[ -t 0 && -t 1 ]]; }; then
  mode=menu
fi

removed_option_hint="探针已改为 miaospeed 反向连接：在主控面板「设置 → miaospeed 后端」添加反向后端，再到探针机器运行 bash node-watcher.sh probe --connect '<连接地址>' --token '<token>'。"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --no-install) auto_install=false; shift ;;
    --no-domain) no_domain=true; named_options=true; shift ;;
    --join|--join=*|--probe-port|--probe-port=*|--public-host|--public-host=*|--no-probes)
      fail "${1%%=*} 已移除。${removed_option_hint}" ;;
    -d|-p|-u|-P|--dir|--port|--username|--password|--domain|--acme|--dns-provider|--acme-email|--http-port|--https-port|--connect|--token|--name|\
    --dir=*|--port=*|--username=*|--password=*|--domain=*|--acme=*|--dns-provider=*|--acme-email=*|--http-port=*|--https-port=*|--connect=*|--token=*|--name=*)
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
        --domain) domain_override=$value ;;
        --acme) acme_mode_override=$value ;;
        --dns-provider) dns_provider_override=$value ;;
        --acme-email) acme_email_override=$value ;;
        --http-port) http_port_override=$value ;;
        --https-port) https_port_override=$value ;;
        --connect) connect_override=$value ;;
        --token) token_override=$value ;;
        --name) probe_name_override=$value ;;
      esac
      ;;
    -*) fail "未知选项：$1；使用 --help 查看用法。" ;;
    *)
      [[ "$mode" == master ]] || fail "${mode} 子命令不接受位置参数；使用 --help 查看用法。"
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

# ---------------------------------------------------------------------------------------------
# 输入校验（不触碰部署目录）
domain_pattern='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'
provider_pattern='^[a-z0-9_]+$'
email_pattern='^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$'
connect_pattern='^wss?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:[0-9]{1,5})?(/[A-Za-z0-9._~%+-]+)*/miaospeed/reverse/[A-Za-z0-9._~%+-]+$'
token_pattern='^[[:graph:]]+$'
container_name_pattern='^[a-z0-9][a-z0-9_-]{0,62}$'
env_name_pattern='^[A-Za-z_][A-Za-z0-9_]*$'

lowercase() {
  printf '%s' "$1" | awk '{ print tolower($0) }'
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

validate_port() {
  valid_port "$1" || fail "${2:-端口}必须为 1-65535 的整数。"
}

valid_domain() {
  [[ ${#1} -le 253 && "$1" =~ $domain_pattern ]]
}

valid_email() {
  [[ ${#1} -le 254 && "$1" =~ $email_pattern ]]
}

valid_connect() {
  [[ ${#1} -le 512 && "$1" =~ $connect_pattern ]]
}

valid_token() {
  [[ ${#1} -le 256 && "$1" =~ $token_pattern ]]
}

domain_hint='--domain 只能是域名（如 monitor.example.com），不含 http://、端口和路径；中文域名请使用 xn-- 开头的 Punycode 形式。'
connect_hint="连接地址格式不正确：应为 wss://主控域名/miaospeed/reverse/<ID>（局域网可用 ws://），请从主控面板「设置 → miaospeed 后端」完整复制，并用单引号包住。"
token_hint='token 格式不正确：请从主控面板完整复制（不能包含空格，最长 256 个字符），并用单引号包住。'

if [[ -n "$port_override" ]]; then
  validate_port "$port_override"
  port_override=$((10#$port_override))
fi
if [[ -n "$http_port_override" ]]; then
  validate_port "$http_port_override" '--http-port '
  http_port_override=$((10#$http_port_override))
fi
if [[ -n "$https_port_override" ]]; then
  validate_port "$https_port_override" '--https-port '
  https_port_override=$((10#$https_port_override))
fi
if [[ -n "$domain_override" ]]; then
  domain_override=$(lowercase "$domain_override")
  valid_domain "$domain_override" || fail "$domain_hint"
  [[ "$no_domain" == false ]] || fail '--domain 与 --no-domain 不能同时使用。'
fi
if [[ -n "$acme_mode_override" ]]; then
  acme_mode_override=$(lowercase "$acme_mode_override")
  [[ "$acme_mode_override" == http || "$acme_mode_override" == dns ]] || fail '--acme 只能是 http 或 dns。'
fi
if [[ -n "$dns_provider_override" ]]; then
  dns_provider_override=${dns_provider_override#dns_}
  [[ "$dns_provider_override" =~ $provider_pattern ]] || fail '--dns-provider 只能包含小写字母、数字和下划线，填写 acme.sh 的 DNS API 名称（不含 dns_ 前缀），如 cf、ali、dp。'
  [[ "$acme_mode_override" != http ]] || fail '--dns-provider 只用于 --acme dns。'
fi
if [[ -n "$acme_email_override" ]]; then
  valid_email "$acme_email_override" || fail '--acme-email 不是有效的邮箱地址。'
fi
if [[ -n "$http_port_override" && -n "$https_port_override" && "$http_port_override" == "$https_port_override" ]]; then
  fail '--http-port 与 --https-port 不能相同。'
fi

case "$mode" in
  probe)
    [[ -z "$port_override$username_override$password_override$domain_override$acme_mode_override$dns_provider_override$acme_email_override$http_port_override$https_port_override" && "$no_domain" == false ]] \
      || fail 'probe 子命令只支持 --connect、--token、--dir、--name 和 --no-install；端口、账号、域名属于主控设置。'
    deploy_dir=${deploy_dir:-$default_probe_dir}
    if [[ -n "$connect_override" ]]; then
      valid_connect "$connect_override" || fail "$connect_hint"
    fi
    if [[ -n "$token_override" ]]; then
      valid_token "$token_override" || fail "$token_hint"
    fi
    if [[ -n "$probe_name_override" ]]; then
      [[ "$probe_name_override" =~ $container_name_pattern ]] || fail '--name 只能包含小写字母、数字、- 和 _，并以字母或数字开头。'
      case "$probe_name_override" in
        node-watcher|node-watcher-acme|node-watcher-probe) fail "--name 不能使用 ${probe_name_override}（主控和旧版探针在用）。" ;;
      esac
    fi
    ;;
  menu)
    [[ "$named_options" == false && $positional -eq 0 ]] || fail 'menu 子命令只支持 --no-install。'
    ;;
  *)
    [[ -z "$connect_override$token_override$probe_name_override" ]] \
      || fail "--connect / --token / --name 只用于探针：bash node-watcher.sh probe --connect '<连接地址>' --token '<token>'。"
    deploy_dir=${deploy_dir:-$default_master_dir}
    ;;
esac

# ---------------------------------------------------------------------------------------------
# 系统检查
[[ "$(uname -s)" == Linux ]] || fail '请在 Linux 服务器、NAS 或树莓派上运行。'
machine_arch=$(uname -m)
case "$machine_arch" in
  x86_64|amd64) compose_arch=x86_64 ;;
  aarch64|arm64) compose_arch=aarch64 ;;
  armv7l|armv7|armhf) compose_arch=armv7 ;;
  i386|i486|i586|i686|x86) compose_arch=none ;;
  *) compose_arch=unsupported ;;
esac

require_arch() {
  if [[ "$1" == master ]]; then
    if [[ "$compose_arch" != x86_64 && "$compose_arch" != aarch64 ]]; then
      fail "镜像支持 x86_64 / ARM64，当前系统架构 ${machine_arch} 不支持；树莓派请使用 64 位系统。"
    fi
  elif [[ "$compose_arch" == unsupported ]]; then
    fail "miaospeed 镜像支持 x86_64 / ARM64 / ARMv7 / x86，当前系统架构 ${machine_arch} 不支持。"
  fi
}
if [[ "$mode" != menu ]]; then require_arch "$mode"; fi

if [[ "$(id -u)" != 0 ]]; then
  if command -v sudo >/dev/null 2>&1 && [[ -f "$0" ]]; then
    exec sudo -E bash "$0" ${original_args[@]+"${original_args[@]}"}
  fi
  fail '请切换到 root 后运行，或下载脚本后使用 sudo bash node-watcher.sh。'
fi

temporary_file=''
download_dir=''
trap 'if [[ -n "$temporary_file" ]]; then rm -f -- "$temporary_file"; fi; if [[ -n "$download_dir" ]]; then rm -rf -- "$download_dir"; fi' EXIT

# ---------------------------------------------------------------------------------------------
# .env 读写
read_setting() {
  local file=${2:-.env}
  [[ -f "$file" && -r "$file" ]] || return 0
  awk -v key="$1" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" {
      value = $0
      sub(/^[^=]*=[[:space:]]*/, "", value)
      sub(/[[:space:]]+$/, "", value)
    }
    END { print value }
  ' "$file"
}

# Value without surrounding quotes, for display and comparisons.
setting_value() {
  local value
  value=$(read_setting "$@")
  case "$value" in
    \#*) value='' ;;
    \"*\")
      value=${value:1:${#value}-2}
      value=${value//\$\$/\$}
      ;;
    \'*\') value=${value:1:${#value}-2} ;;
  esac
  printf '%s' "$value"
}

setting_missing() {
  local current
  current=$(read_setting "$@")
  case "$current" in
    ''|'""'|"''"|\#*|'"" #'*|"'' #"*) return 0 ;;
    *) return 1 ;;
  esac
}

set_setting() {
  local key="$1" value="$2"
  # Escape dotenv strings and Compose interpolation, including trailing backslashes.
  case "$key" in
    AUTH_USERNAME|AUTH_PASSWORD|MIAOSPEED_CONNECT|MIAOSPEED_TOKEN)
      value=${value//\\/\\\\}
      value=${value//\"/\\\"}
      value=${value//\$/\$\$}
      value="\"$value\""
      ;;
  esac
  temporary_file=$(mktemp "${deploy_dir}/.env.XXXXXX")
  awk -v key="$key" '$0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*="' .env > "$temporary_file"
  printf '%s=%s\n' "$key" "$value" >> "$temporary_file"
  mv -- "$temporary_file" .env
  temporary_file=''
}

# Write only when the stored value differs (unquoted keys).
put_setting() {
  if [[ "$(read_setting "$1")" != "$2" ]]; then set_setting "$1" "$2"; fi
}

unset_setting() {
  temporary_file=$(mktemp "${deploy_dir}/.env.XXXXXX")
  awk -v key="$1" '$0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*="' .env > "$temporary_file"
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

# One NAME=value line for a Compose env_file. Single quotes keep the value literal in every
# Compose version; values containing a single quote fall back to escaped double quotes.
env_file_line() {
  local value=$2
  if [[ "$value" != *"'"* ]]; then
    printf "%s='%s'\n" "$1" "$value"
  else
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//\$/\$\$}
    printf '%s="%s"\n' "$1" "$value"
  fi
}

# ---------------------------------------------------------------------------------------------
# Docker 环境
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

hub_mirror_loaded=true
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
      hub_mirror_loaded=false
      printf 'Docker Hub 加速配置已写入 %s，但守护进程尚未加载；请通过系统或 NAS 管理界面重新加载 Docker，或核对其实际配置文件路径。\n本次将直接通过毫秒镜像 ghcr.1ms.run / docker.1ms.run 拉取镜像。\n' "$config_file" >&2
      return 0
    fi
  fi
  printf 'Docker Hub 镜像加速已启用：毫秒镜像 https://docker.1ms.run\n'
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    compose_command=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1 && docker-compose version --short 2>/dev/null | awk '/^v?[2-9]\./ { ok=1 } END { exit !ok }'; then
    compose_command=(docker-compose)
  else
    return 1
  fi
}

check_daemon_platform() {
  case "$daemon_platform" in
    linux/amd64|linux/x86_64|linux/arm64|linux/aarch64) return 0 ;;
    linux/armv7l|linux/armv7|linux/arm|linux/armhf|linux/i386|linux/i686|linux/386|linux/x86)
      if [[ "$1" == probe ]]; then return 0; fi
      ;;
  esac
  if [[ "$1" == probe ]]; then
    fail "不支持 Docker 平台 ${daemon_platform}；miaospeed 需要 Linux AMD64 / ARM64 / ARMv7 / 386。"
  fi
  fail "不支持 Docker 平台 ${daemon_platform}；需要 Linux AMD64 或 ARM64。"
}

docker_prepared=false
daemon_platform=''
security_options=''
compose_command=()
# Install / start Docker and Compose, configure the Docker Hub mirror. $1 = master | probe.
prepare_docker() {
  local docker_endpoint attempt compose_url expected_hash actual_hash
  if [[ "$docker_prepared" == true ]]; then
    check_daemon_platform "$1"
    return 0
  fi
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
  check_daemon_platform "$1"
  security_options=$(docker info --format '{{json .SecurityOptions}}')
  if [[ "$1" == master ]]; then
    case "$security_options" in
      *rootless*|*userns*) fail '此脚本的目录权限设置仅适用于 rootful Docker，rootless / userns 请按 README 手动部署。' ;;
    esac
  fi

  configure_registry_mirror

  if ! detect_compose; then
    [[ "$auto_install" == true ]] || fail '需要 Compose v2 或更新版本（docker compose / docker-compose），去掉 --no-install 可自动安装。'
    [[ "$compose_arch" != none ]] || fail "需要 Compose v2：${machine_arch} 没有官方 Compose 安装包，请先通过系统软件源安装 docker compose 插件后重试。"
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
  docker_prepared=true
}

# For management actions: use the existing Docker / Compose without installing or reconfiguring.
require_docker_tools() {
  command -v docker >/dev/null 2>&1 || fail '未检测到 Docker，请先安装主控或探针。'
  docker info >/dev/null 2>&1 || fail '无法连接 Docker，请确认 Docker 服务已启动。'
  detect_compose || fail '未检测到 Docker Compose v2，请先重新运行安装。'
}

# Keep values from the caller's shell out of Compose interpolation: the .env file is authoritative.
scrub_compose_env() {
  unset NODE_WATCHER_IMAGE PORT AUTH_USERNAME AUTH_PASSWORD AUTH_SESSION_SECRET AUTH_SESSION_TTL_HOURS
  unset AUTH_COOKIE_SECURE TRUST_PROXY NODE_WATCHER_VOLUME_LABEL DOCKER_DEFAULT_PLATFORM
  unset MIAOSPEED_LOCAL LOCAL_PROBE_NAME MIAOSPEED_MMDB MIAOSPEED_PUBLIC_URL
  unset HTTP_HOST_PORT HTTPS_HOST_PORT ACME_IMAGE
  unset MIAOSPEED_IMAGE MIAOSPEED_CONTAINER MIAOSPEED_CONNECT MIAOSPEED_TOKEN
}

# Docker Hub images: use the canonical name while the daemon mirror is active, otherwise pull
# explicitly through docker.1ms.run. Custom values in .env are left alone.
managed_hub_image() {
  local key=$1 default=$2 current wanted
  current=$(setting_value "$key")
  if [[ -n "$current" && "$current" != "$default" && "$current" != "$hub_mirror/$default" ]]; then
    return 0
  fi
  wanted=$default
  if [[ "$hub_mirror_loaded" != true ]]; then wanted=$hub_mirror/$default; fi
  put_setting "$key" "$wanted"
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

# Whether the running node-watcher container already publishes this host port (repeat deploys).
port_published_by_master() {
  local mappings
  mappings=$(docker port node-watcher 2>/dev/null </dev/null) || return 1
  printf '%s\n' "$mappings" | awk -v port="$1" '{ n = split($NF, parts, ":"); if (parts[n] == port) found = 1 } END { exit !found }'
}

enter_deploy_dir() {
  local managed_path
  mkdir -p "$deploy_dir"
  cd "$deploy_dir"
  deploy_dir=$(pwd -P)
  for managed_path in .env compose.deploy.yml data logs acme acme.env; do
    [[ ! -L "$managed_path" ]] || fail "${deploy_dir}/${managed_path} 是符号链接，停止以避免修改其他路径。"
  done
  [[ ! -e .env || -f .env ]] || fail '.env 必须是普通文件。'
  [[ ! -e compose.deploy.yml || -f compose.deploy.yml ]] || fail 'compose.deploy.yml 必须是普通文件。'
  [[ ! -e acme.env || -f acme.env ]] || fail 'acme.env 必须是普通文件。'
  touch .env
  chmod 600 .env
}

container_state() {
  docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null </dev/null || true
}

server_address() {
  local server_ip
  server_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="src") {print $(i+1); exit}}') || server_ip=''
  if [[ -z "$server_ip" ]]; then
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}') || server_ip=''
  fi
  server_ip=${server_ip:-服务器IP}
  [[ "$server_ip" != *:* ]] || server_ip="[$server_ip]"
  printf '%s' "$server_ip"
}

# ---------------------------------------------------------------------------------------------
# 域名与证书（acme.sh）
domain=''
previous_domain=''
acme_mode=http
dns_provider=''
acme_email=''
http_host_port=80
https_host_port=443
acme_settings_changed=false
dns_env_names=()
dns_env_values=()

# Environment variables each acme.sh DNS API reads. Entries ending in _ are prefixes.
dns_env_patterns() {
  case "$1" in
    cf) printf '%s' 'CF_' ;;
    ali) printf '%s' 'Ali_' ;;
    dp) printf '%s' 'DP_' ;;
    dpi) printf '%s' 'DPI_' ;;
    tencent) printf '%s' 'Tencent_' ;;
    huaweicloud) printf '%s' 'HUAWEICLOUD_' ;;
    hw) printf '%s' 'HW_' ;;
    gd) printf '%s' 'GD_' ;;
    namesilo) printf '%s' 'Namesilo_' ;;
    aws) printf '%s' 'AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DNS_SLOWRATE' ;;
    dgon) printf '%s' 'DO_API_KEY' ;;
    porkbun) printf '%s' 'PORKBUN_' ;;
    namecom) printf '%s' 'Namecom_' ;;
    he) printf '%s' 'HE_Username HE_Password' ;;
    vultr) printf '%s' 'VULTR_API_KEY' ;;
    linode_v4) printf '%s' 'LINODE_V4_API_KEY' ;;
    duckdns) printf '%s' 'DuckDNS_' ;;
    cloudns) printf '%s' 'CLOUDNS_' ;;
    west_cn) printf '%s' 'WEST_' ;;
  esac
}

collect_dns_credentials() {
  local patterns extra names name pattern matched value
  dns_env_names=()
  dns_env_values=()
  patterns=$(dns_env_patterns "$1")
  extra=${ACME_DNS_ENV:-}
  for name in $extra; do
    [[ "$name" =~ $env_name_pattern ]] || fail "ACME_DNS_ENV 中的变量名 ${name} 无效。"
    case "$name" in
      PATH|HOME|SHELL|USER|LE_*|AUTO_UPGRADE|ACME_DNS_ENV) fail "ACME_DNS_ENV 不能包含 ${name}。" ;;
    esac
  done
  names=$(compgen -e 2>/dev/null) || names=$(env | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ { print $1 }')
  for name in $names; do
    matched=false
    for pattern in $patterns $extra; do
      if [[ "$pattern" == *_ ]]; then
        if [[ "$name" == "$pattern"* ]]; then matched=true; fi
      elif [[ "$name" == "$pattern" ]]; then
        matched=true
      fi
    done
    [[ "$matched" == true ]] || continue
    value=${!name-}
    [[ -n "$value" ]] || continue
    [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "环境变量 ${name} 不能包含换行。"
    dns_env_names+=("$name")
    dns_env_values+=("$value")
  done
  return 0
}

has_dns_credential() {
  local name
  for name in ${dns_env_names[@]+"${dns_env_names[@]}"}; do
    if [[ "$name" == "$1" ]]; then return 0; fi
  done
  return 1
}

check_dns_credentials() {
  local name
  local -a required=()
  case "$1" in
    cf)
      if has_dns_credential CF_Token || { has_dns_credential CF_Key && has_dns_credential CF_Email; }; then return 0; fi
      fail 'Cloudflare 需要 CF_Token（推荐，API Token 需有 Zone → DNS → Edit 权限），或 CF_Key + CF_Email。'
      ;;
    ali) required=(Ali_Key Ali_Secret) ;;
    dp) required=(DP_Id DP_Key) ;;
    tencent) required=(Tencent_SecretId Tencent_SecretKey) ;;
    huaweicloud) required=(HUAWEICLOUD_Username HUAWEICLOUD_Password HUAWEICLOUD_DomainName) ;;
  esac
  for name in ${required[@]+"${required[@]}"}; do
    has_dns_credential "$name" || fail "dns_${1} 缺少凭据 ${name}：请 export 后用 sudo -E 重新运行（需要：${required[*]}）。"
  done
  return 0
}

# Work out the effective domain / certificate settings from the options and the saved .env,
# before anything in the deployment directory changes.
resolve_master_settings() {
  local env_file="$deploy_dir/.env" saved_mode saved_provider
  previous_domain=$(setting_value NODE_WATCHER_DOMAIN "$env_file")
  saved_mode=$(setting_value ACME_MODE "$env_file")
  saved_provider=$(setting_value ACME_DNS_PROVIDER "$env_file")
  if [[ "$no_domain" == true ]]; then
    domain=''
  else
    domain=${domain_override:-$previous_domain}
  fi
  acme_settings_changed=false
  dns_env_names=()
  dns_env_values=()
  if [[ -z "$domain" ]]; then
    [[ -z "$acme_mode_override$dns_provider_override$acme_email_override$http_port_override$https_port_override" ]] \
      || fail '--acme、--dns-provider、--acme-email、--http-port、--https-port 需要配合 --domain 使用。'
    return 0
  fi
  [[ -z "$port_override" ]] \
    || fail '使用域名时面板通过 HTTP / HTTPS 端口（默认 80 / 443，可用 --http-port / --https-port 修改）访问，--port 只用于不使用域名的部署；取消域名请加 --no-domain。'
  valid_domain "$domain" || fail ".env 中的 NODE_WATCHER_DOMAIN（${domain}）不是有效域名，请用 --domain 重新指定。"

  acme_mode=$acme_mode_override
  if [[ -z "$acme_mode" ]]; then
    if [[ -n "$dns_provider_override" ]]; then acme_mode=dns; else acme_mode=${saved_mode:-http}; fi
  fi
  [[ "$acme_mode" == http || "$acme_mode" == dns ]] || fail '.env 中的 ACME_MODE 只能是 http 或 dns。'
  dns_provider=''
  if [[ "$acme_mode" == dns ]]; then
    dns_provider=${dns_provider_override:-$saved_provider}
    [[ -n "$dns_provider" ]] || fail 'DNS 验证需要用 --dns-provider 指定 DNS 服务商（acme.sh 的 dns_<名称>，如 cf、ali、dp、tencent）。'
    [[ "$dns_provider" =~ $provider_pattern ]] || fail '.env 中的 ACME_DNS_PROVIDER 无效，请用 --dns-provider 重新指定。'
    collect_dns_credentials "$dns_provider"
    if [[ ${#dns_env_names[@]} -eq 0 ]]; then
      if [[ "$dns_provider" != "$saved_provider" || ! -s "$deploy_dir/acme.env" ]]; then
        fail "DNS 验证（dns_${dns_provider}）需要 DNS API 凭据：请先 export 对应的环境变量（如 Cloudflare：export CF_Token='…'；阿里云：Ali_Key、Ali_Secret），再以 root 或 sudo -E 运行；其他服务商用 ACME_DNS_ENV=\"变量1 变量2\" 指定变量名。详见 --help。"
      fi
    else
      check_dns_credentials "$dns_provider"
    fi
  fi
  if [[ -n "$previous_domain" && "$domain" == "$previous_domain" ]]; then
    if [[ "$acme_mode" != "${saved_mode:-http}" ]] || [[ "$acme_mode" == dns && "$dns_provider" != "$saved_provider" ]]; then
      acme_settings_changed=true
    fi
  fi
  acme_email=${acme_email_override:-$(setting_value ACME_EMAIL "$env_file")}
  if [[ -n "$acme_email" ]]; then valid_email "$acme_email" || fail '.env 中的 ACME_EMAIL 不是有效的邮箱地址。'; fi
  http_host_port=${http_port_override:-$(setting_value HTTP_HOST_PORT "$env_file")}
  https_host_port=${https_port_override:-$(setting_value HTTPS_HOST_PORT "$env_file")}
  http_host_port=${http_host_port:-80}
  https_host_port=${https_host_port:-443}
  validate_port "$http_host_port" 'HTTP 端口'
  validate_port "$https_host_port" 'HTTPS 端口'
  http_host_port=$((10#$http_host_port))
  https_host_port=$((10#$https_host_port))
  [[ "$http_host_port" != "$https_host_port" ]] || fail 'HTTP 与 HTTPS 端口不能相同。'
  return 0
}

public_reverse_base() {  # domain https-port
  if [[ "$2" == 443 ]]; then printf 'wss://%s' "$1"; else printf 'wss://%s:%s' "$1" "$2"; fi
}

https_url() {
  if [[ "$https_host_port" == 443 ]]; then printf 'https://%s' "$domain"; else printf 'https://%s:%s' "$domain" "$https_host_port"; fi
}

http_url() {
  if [[ "$http_host_port" == 80 ]]; then printf 'http://%s' "$domain"; else printf 'http://%s:%s' "$domain" "$http_host_port"; fi
}

certificate_ready() {
  [[ -s data/tls/fullchain.pem && -s data/tls/key.pem ]]
}

certificate_failure_hint() {
  warn "证书申请失败，面板仍可通过 $(http_url) 使用（HTTP，未加密）。请检查："
  if [[ "$acme_mode" == dns ]]; then
    warn "  1. DNS API 凭据是否正确、是否有修改 ${domain} 解析记录的权限（凭据保存在 ${deploy_dir}/acme.env）；"
    warn "  2. --dns-provider 是否对应域名所在的 DNS 服务商（当前 dns_${dns_provider}）。"
  else
    warn "  1. 域名 ${domain} 的 A / AAAA 记录已指向本机公网 IP（IPv6 记录也要指向本机，否则请删除）；"
    warn "  2. 公网可以访问本机 TCP ${http_host_port} 端口（HTTP 验证固定访问公网 80 端口；放行防火墙 / 云安全组，且未被运营商封锁）；"
    warn '  3. 域名未开启 CDN 代理（如 Cloudflare 小黄云）；做不到时请改用 --acme dns。'
  fi
  warn '修复后重新运行 bash node-watcher.sh（或在管理菜单选择「3. 证书管理」）即可重试；Let'"'"'s Encrypt 对同一域名每小时最多允许 5 次失败验证，请确认问题解决后再重试。'
}

# Issue (or skip while still valid) and install the certificate through the acme container.
issue_certificate() {
  local force=${1:-false} status reload_cmd
  local -a issue_args
  issue_args=(--issue --server letsencrypt -d "$domain")
  if [[ "$acme_mode" == dns ]]; then
    issue_args+=(--dns "dns_${dns_provider}")
    say skyBlue "正在通过 DNS API（dns_${dns_provider}）为 ${domain} 申请 Let's Encrypt 证书……"
  else
    issue_args+=(--webroot /webroot)
    say skyBlue "正在通过 HTTP 验证为 ${domain} 申请 Let's Encrypt 证书……"
  fi
  if [[ -n "$acme_email" ]]; then issue_args+=(--accountemail "$acme_email"); fi
  if [[ "$force" == true ]]; then issue_args+=(--force); fi
  status=0
  "${compose[@]}" exec -T acme acme.sh "${issue_args[@]}" </dev/null || status=$?
  if [[ $status -eq 2 ]]; then
    say green '证书仍在有效期内，无需重新申请。'
  elif [[ $status -ne 0 ]]; then
    certificate_failure_hint
    return 1
  fi
  # acme.sh writes the files as root; the dashboard runs as uid 1000 and the key stays private.
  reload_cmd='chown 1000:1000 /tls/fullchain.pem /tls/key.pem && chmod 644 /tls/fullchain.pem && chmod 600 /tls/key.pem'
  if ! "${compose[@]}" exec -T acme acme.sh --install-cert -d "$domain" --ecc \
      --key-file /tls/key.pem --fullchain-file /tls/fullchain.pem --reloadcmd "$reload_cmd" </dev/null \
      || ! certificate_ready; then
    warn "证书已签发，但安装到 ${deploy_dir}/data/tls/ 失败，请根据上方 acme.sh 输出排查后重新运行脚本。"
    return 1
  fi
  say green "证书已安装到 ${deploy_dir}/data/tls/，到期前由 acme.sh 容器自动续期并重新安装。"
  return 0
}

# ---------------------------------------------------------------------------------------------
# 主控部署
write_master_compose() {
  {
    cat <<'COMPOSE'
services:
  node-watcher:
    image: ${NODE_WATCHER_IMAGE:-ghcr.1ms.run/leoch627/node-watcher:latest}
    container_name: node-watcher
    ports:
COMPOSE
    if [[ -n "$domain" ]]; then
      cat <<'COMPOSE'
      - "${HTTP_HOST_PORT:-80}:3000"
      - "${HTTPS_HOST_PORT:-443}:3443"
COMPOSE
    else
      cat <<'COMPOSE'
      - "${PORT:?PORT must not be empty}:3000"
COMPOSE
    fi
    cat <<'COMPOSE'
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
      MIAOSPEED_LOCAL: ${MIAOSPEED_LOCAL:-true}
      LOCAL_PROBE_NAME: ${LOCAL_PROBE_NAME:-}
      MIAOSPEED_MMDB: ${MIAOSPEED_MMDB:-}
      MIAOSPEED_PUBLIC_URL: ${MIAOSPEED_PUBLIC_URL:-}
COMPOSE
    if [[ -n "$domain" ]]; then
      cat <<'COMPOSE'
      HTTPS_PORT: 3443
      HTTPS_PUBLIC_PORT: ${HTTPS_HOST_PORT:-443}
      HTTPS_REDIRECT: "true"
      TLS_CERT_FILE: /app/data/tls/fullchain.pem
      TLS_KEY_FILE: /app/data/tls/key.pem
      ACME_WEBROOT: /app/data/acme
COMPOSE
    fi
    cat <<'COMPOSE'
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
COMPOSE
    if [[ -n "$domain" ]]; then
      cat <<'COMPOSE'
  # Let's Encrypt certificates: acme.sh issues into ./data/tls and its cron renews them.
  acme:
COMPOSE
      printf '    image: ${ACME_IMAGE:-%s}\n' "$default_acme_image"
      cat <<'COMPOSE'
    container_name: node-watcher-acme
    command: daemon
    volumes:
      - ./data/acme:/webroot${NODE_WATCHER_VOLUME_LABEL:-}
      - ./data/tls:/tls${NODE_WATCHER_VOLUME_LABEL:-}
      - ./acme:/acme.sh${NODE_WATCHER_VOLUME_LABEL:-}
COMPOSE
      if [[ "$acme_mode" == dns ]]; then
        printf '    env_file: acme.env\n'
      fi
      cat <<'COMPOSE'
    environment:
      AUTO_UPGRADE: "0"
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
COMPOSE
    fi
  } > "$1"
}

wait_master_ready() {
  local attempt state
  for ((attempt = 0; attempt < 60; attempt++)); do
    state=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' node-watcher) || return 1
    case "$state" in
      'running healthy') return 0 ;;
      *unhealthy*|exited*|dead*) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

start_master() {
  if "${compose[@]}" up -d --no-build --remove-orphans && wait_master_ready; then return 0; fi
  printf '容器未能在等待时间内正常启动，请检查以下日志：\n' >&2
  "${compose[@]}" logs --tail=80 >&2 || true
  fail "启动失败，配置和数据已保留。请修复日志中的问题后重试。"
}

deploy_master() {
  local old_port selected_port candidate attempt volume_label old_public_url new_public_url
  local index certificate_ok=false cookie_wanted
  enter_deploy_dir

  if [[ -n "$domain" ]]; then
    for candidate in "$http_host_port" "$https_host_port"; do
      if ! port_published_by_master "$candidate" && port_in_use "$candidate"; then
        fail "端口 ${candidate} 已被占用（常见于 Nginx / Caddy 等 Web 服务）。使用域名需要 HTTP ${http_host_port} 和 HTTPS ${https_host_port} 端口：请停止占用的服务，或用 --http-port / --https-port 指定其他端口。"
      fi
    done
    old_public_url=''
    if [[ -n "$previous_domain" ]]; then
      old_port=$(setting_value HTTPS_HOST_PORT)
      old_public_url=$(public_reverse_base "$previous_domain" "${old_port:-443}")
    fi
    new_public_url=$(public_reverse_base "$domain" "$https_host_port")
    put_setting NODE_WATCHER_DOMAIN "$domain"
    put_setting ACME_MODE "$acme_mode"
    if [[ "$acme_mode" == dns ]]; then put_setting ACME_DNS_PROVIDER "$dns_provider"; fi
    if [[ -n "$acme_email" ]]; then put_setting ACME_EMAIL "$acme_email"; fi
    put_setting HTTP_HOST_PORT "$http_host_port"
    put_setting HTTPS_HOST_PORT "$https_host_port"
    case "$(setting_value MIAOSPEED_PUBLIC_URL)" in
      ''|"$old_public_url") put_setting MIAOSPEED_PUBLIC_URL "$new_public_url" ;;
    esac
  else
    if [[ -n "$port_override" ]]; then
      old_port=$(setting_value PORT)
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
    if [[ -n "$previous_domain" ]]; then
      # Leaving built-in HTTPS: stop renewing the old certificate and allow HTTP logins again.
      docker exec node-watcher-acme acme.sh --remove -d "$previous_domain" --ecc </dev/null >/dev/null 2>&1 || true
      case "$(setting_value MIAOSPEED_PUBLIC_URL)" in
        "wss://${previous_domain}"|"wss://${previous_domain}:"*) set_setting MIAOSPEED_PUBLIC_URL '' ;;
      esac
      set_setting NODE_WATCHER_DOMAIN ''
      set_setting AUTH_COOKIE_SECURE false
    fi
  fi
  if [[ "$regenerate_password" == true ]]; then
    password_override=$(openssl rand -hex 18)
    generated_password=$password_override
  fi
  [[ -z "$username_override" ]] || set_setting AUTH_USERNAME "$username_override"
  [[ -z "$password_override" ]] || set_setting AUTH_PASSWORD "$password_override"

  case "$(read_setting NODE_WATCHER_IMAGE)" in
    ghcr.io/leoch627/node-watcher:latest|'"ghcr.io/leoch627/node-watcher:latest"'|"'ghcr.io/leoch627/node-watcher:latest'")
      set_setting NODE_WATCHER_IMAGE "$default_master_image" ;;
  esac
  ensure_setting NODE_WATCHER_IMAGE "$default_master_image"
  ensure_setting AUTH_USERNAME admin
  ensure_setting AUTH_PASSWORD random-password
  ensure_setting AUTH_SESSION_SECRET random-secret
  ensure_setting AUTH_SESSION_TTL_HOURS 24
  ensure_setting AUTH_COOKIE_SECURE false
  ensure_setting TRUST_PROXY 0
  volume_label=''
  if [[ "$security_options" == *selinux* ]]; then
    # The acme container shares ./data/tls and ./data/acme, so domain mode needs the shared label.
    if [[ -n "$domain" ]]; then volume_label=:z; else volume_label=:Z; fi
  fi
  ensure_setting NODE_WATCHER_VOLUME_LABEL "$volume_label"
  if [[ -n "$domain" && "$(setting_value NODE_WATCHER_VOLUME_LABEL)" == ':Z' ]]; then
    set_setting NODE_WATCHER_VOLUME_LABEL ':z'
  fi

  if [[ -n "$domain" ]]; then
    managed_hub_image ACME_IMAGE "$default_acme_image"
    if [[ ${#dns_env_names[@]} -gt 0 ]]; then
      temporary_file=$(mktemp "${deploy_dir}/.acme.env.XXXXXX")
      for ((index = 0; index < ${#dns_env_names[@]}; index++)); do
        env_file_line "${dns_env_names[$index]}" "${dns_env_values[$index]}" >> "$temporary_file"
      done
      chmod 600 "$temporary_file"
      mv -- "$temporary_file" acme.env
      temporary_file=''
    fi
    if [[ "$acme_mode" != dns ]]; then rm -f -- acme.env; fi
    if [[ -n "$previous_domain" && "$previous_domain" != "$domain" ]]; then
      rm -f -- data/tls/fullchain.pem data/tls/key.pem
    fi
    if certificate_ready; then put_setting AUTH_COOKIE_SECURE true; else put_setting AUTH_COOKIE_SECURE false; fi
  else
    rm -f -- acme.env
  fi

  temporary_file=$(mktemp "${deploy_dir}/.compose.XXXXXX")
  write_master_compose "$temporary_file"
  mv -- "$temporary_file" compose.deploy.yml
  temporary_file=''

  scrub_compose_env
  compose=("${compose_command[@]}" --project-name node-watcher --env-file "$deploy_dir/.env" -f "$deploy_dir/compose.deploy.yml")
  "${compose[@]}" config --quiet

  printf '部署目录：%s\nDocker 平台：%s\n正在拉取预编译镜像……\n' "$deploy_dir" "$daemon_platform"
  if ! "${compose[@]}" pull; then
    fail "镜像拉取失败，未启动或替换容器。若提示 no matching manifest，请确认 ARM64 多架构镜像已发布；若提示 denied、限流或超时，请检查毫秒镜像 ghcr.1ms.run / docker.1ms.run 的访问限制及上游镜像发布状态。配置已保留在 ${deploy_dir}/.env，可修改 NODE_WATCHER_IMAGE 后重试。"
  fi

  mkdir -p data logs
  if [[ -n "$domain" ]]; then
    mkdir -p data/tls data/acme acme
    chmod 700 acme
  fi
  chown -R 1000:1000 data logs
  chmod 700 data logs

  # Inspect health ourselves so older Compose v2 installations work without --wait.
  start_master

  if [[ -n "$domain" ]]; then
    if [[ -n "$previous_domain" && "$previous_domain" != "$domain" ]]; then
      docker exec node-watcher-acme acme.sh --remove -d "$previous_domain" --ecc </dev/null >/dev/null 2>&1 || true
    fi
    if issue_certificate "$acme_settings_changed"; then certificate_ok=true; fi
    if certificate_ready; then cookie_wanted=true; else cookie_wanted=false; fi
    if [[ "$(setting_value AUTH_COOKIE_SECURE)" != "$cookie_wanted" ]]; then
      set_setting AUTH_COOKIE_SECURE "$cookie_wanted"
      start_master
    fi
    if certificate_ready; then certificate_ok=true; fi
  fi
  print_master_summary "$certificate_ok"
}

print_shortcut_hint() {
  if shortcut_is_ours; then
    printf '管理菜单：输入 %s（证书、端口密码、日志、更新、卸载）。\n' "$shortcut_name"
  else
    printf '管理菜单：bash node-watcher.sh menu（证书、端口密码、日志、更新、卸载）。\n'
  fi
}

print_master_summary() {
  local login_username public_port public_url
  "${compose[@]}" ps
  login_username=$(docker exec node-watcher printenv AUTH_USERNAME 2>/dev/null </dev/null) || login_username=''
  [[ -n "$login_username" ]] || login_username=$(setting_value AUTH_USERNAME)
  printf '\n部署完成。\n'
  if [[ -n "$domain" ]]; then
    if [[ "$1" == true ]]; then
      printf '访问地址：%s\n' "$(https_url)"
    else
      printf '访问地址：%s（证书申请成功后改用 %s）\n' "$(http_url)" "$(https_url)"
    fi
  else
    public_port=$(docker port node-watcher 3000/tcp </dev/null | awk -F: 'NR == 1 {print $NF}') || public_port=''
    public_port=${public_port:-$(setting_value PORT)}
    printf '访问地址：http://%s:%s\n' "$(server_address)" "$public_port"
  fi
  printf '用户名：%s\n' "$login_username"
  if [[ -n "$generated_password" ]]; then
    printf '随机登录密码：%s\n请妥善保存，不要将其公开。\n' "$generated_password"
  elif [[ -n "$password_override" ]]; then
    printf '登录密码：使用你设置的密码（不在此显示）。\n'
  else
    printf '登录密码：保留已有密码，可在下方 .env 文件中查看 AUTH_PASSWORD。\n'
  fi
  printf '配置文件：%s/.env（权限 600）\n' "$deploy_dir"
  if [[ -n "$domain" ]]; then
    public_url=$(setting_value MIAOSPEED_PUBLIC_URL)
    printf 'miaospeed 反向连接地址：%s/miaospeed/reverse/<后端ID>\n' "${public_url:-$(public_reverse_base "$domain" "$https_host_port")}"
    printf '添加探针：在面板「设置 → miaospeed 后端」添加反向后端，把生成的一键命令复制到探针机器运行。\n'
    printf '证书：%s/data/tls/，由 acme.sh 容器 node-watcher-acme 每天检查并在到期前自动续期。\n' "$deploy_dir"
    if [[ "$acme_mode" == dns ]]; then
      printf 'DNS API 凭据：%s/acme.env（权限 600，仅证书容器读取）。\n' "$deploy_dir"
    fi
    printf '请在服务器防火墙 / 云安全组中放行 TCP %s 和 %s 端口。\n' "$http_host_port" "$https_host_port"
  else
    printf '添加探针：在面板「设置 → miaospeed 后端」添加反向后端；探针经公网连接时请用 --domain 开启 HTTPS（miaospeed 只信任公共 CA 证书）。\n'
    printf '请在服务器防火墙 / 云安全组中放行上方 TCP 端口；公网访问请将服务器IP换为公网地址。\n'
  fi
  printf '更新镜像：重新运行本脚本，已有密码和数据不会被重置。\n'
  print_shortcut_hint
  printf '查看日志：'
  printf '%q ' "${compose[@]}"
  printf 'logs -f --tail=100\n'
}

# ---------------------------------------------------------------------------------------------
# 探针（miaospeed 反向连接）
url_host() {
  local rest=${1#*://}
  rest=${rest%%/*}
  if [[ "$rest" == \[* ]]; then
    rest="${rest%%]*}]"
  else
    rest=${rest%%:*}
  fi
  printf '%s' "$rest"
}

url_authority() {
  local rest=${1#*://}
  printf '%s' "${rest%%/*}"
}

is_private_host() {
  local host first second
  host=$(lowercase "$1")
  host=${host#[}
  host=${host%]}
  case "$host" in
    localhost|*.localhost|*.local|*.lan|*.home|*.internal|*.home.arpa|*.intranet) return 0 ;;
    ::1|fc*:*|fd*:*|fe80:*) return 0 ;;
  esac
  if [[ "$host" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    first=$((10#${BASH_REMATCH[1]}))
    second=$((10#${BASH_REMATCH[2]}))
    if (( first == 10 || first == 127 || (first == 192 && second == 168) || (first == 172 && second >= 16 && second <= 31) \
      || (first == 169 && second == 254) || (first == 100 && second >= 64 && second <= 127) )); then
      return 0
    fi
    return 1
  fi
  # Single-label names (e.g. "nas") only resolve inside a LAN.
  if [[ "$host" != *.* && "$host" != *:* ]]; then return 0; fi
  return 1
}

warn_plain_websocket() {
  local host
  [[ "$1" == ws://* ]] || return 0
  host=$(url_host "$1")
  if is_private_host "$host"; then return 0; fi
  warn '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
  warn "警告：连接地址使用未加密的 ws://，而 ${host} 不是内网地址。"
  warn '测试任务包含节点地址和密码，会在公网上明文传输，可能被窃听或篡改。'
  warn '建议为主控配置域名和 HTTPS（在主控运行 bash node-watcher.sh --domain 你的域名），再在面板复制 wss:// 地址重新部署。'
  warn '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
}

resolve_probe_settings() {
  local env_file="$deploy_dir/.env"
  if { [[ -z "$connect_override" ]] && setting_missing MIAOSPEED_CONNECT "$env_file"; } \
    || { [[ -z "$token_override" ]] && setting_missing MIAOSPEED_TOKEN "$env_file"; }; then
    fail "首次部署探针需要连接地址和 token：bash node-watcher.sh probe --connect 'wss://主控域名/miaospeed/reverse/<ID>' --token '<token>'（在主控面板「设置 → miaospeed 后端」添加反向后端后复制）。"
  fi
  if [[ -n "$connect_override" ]]; then warn_plain_websocket "$connect_override"; fi
  return 0
}

probe_hint() {
  case "$1" in
    *'signature mismatch'*) printf '%s' 'token 不正确：请从主控面板「设置 → miaospeed 后端」复制最新的 token（重置过 token 需要重新部署：bash node-watcher.sh probe --token '"'"'<新 token>'"'"'）。' ;;
    *'clock skew'*) printf '%s' '本机时间与主控相差超过 5 分钟，请校准系统时间（如启用 NTP）后重试。' ;;
    *'http status 404'*) printf '%s' '主控找不到该后端：连接地址中的后端 ID 有误，或该后端已在面板中删除 / 停用，请重新复制连接地址。' ;;
    *'http status'*) printf '%s' '主控返回了非 WebSocket 响应：请确认地址路径为 /miaospeed/reverse/<ID>；主控若在反向代理之后，需要转发 WebSocket 升级请求。' ;;
    *x509*|*certificate*|*'tls:'*) printf '%s' '证书校验失败：miaospeed 只信任公共 CA 签发的证书。请在主控用 --domain 配置域名并自动申请 Let'"'"'s Encrypt 证书，不要使用自签证书或 IP 地址的 wss://。' ;;
    *'no such host'*) printf '%s' '无法解析主控域名：请检查连接地址中的域名和本机 DNS 设置。' ;;
    *'Invalid -connect'*) printf '%s' 'miaospeed 认为连接地址无效，请从主控面板重新复制。' ;;
    *'dial failed'*|*'connection lost'*) printf '%s' '连不上主控：请检查连接地址中的域名 / 端口，主控防火墙 / 云安全组是否放行，以及本机能否访问主控。' ;;
    *) printf '%s' '请根据上方日志排查连接地址、token 和主控证书。' ;;
  esac
}

write_probe_compose() {
  {
    cat <<'COMPOSE'
services:
  miaospeed:
COMPOSE
    printf '    image: ${MIAOSPEED_IMAGE:-%s}\n' "$default_miaospeed_image"
    cat <<'COMPOSE'
    container_name: ${MIAOSPEED_CONTAINER:-miaospeed}
    # Reverse link: miaospeed dials the master; nothing is published on this machine.
    command: ["server", "-connect", "${MIAOSPEED_CONNECT:?MIAOSPEED_CONNECT must not be empty}", "-token", "${MIAOSPEED_TOKEN:?MIAOSPEED_TOKEN must not be empty}"]
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
COMPOSE
  } > "$1"
}

deploy_probe() {
  local old_name name owner connect_url master_address probe_logs state attempt connected=false error_seen=false hint
  enter_deploy_dir

  if ! setting_missing NODE_WATCHER_JOIN; then
    docker rm -f node-watcher-probe </dev/null >/dev/null 2>&1 || true
    for old_name in NODE_WATCHER_JOIN NODE_WATCHER_IMAGE MEDIA_CONCURRENCY NODE_WATCHER_VOLUME_LABEL; do
      unset_setting "$old_name"
    done
    say yellow '已移除旧版 nwp:// 探针容器 node-watcher-probe（该协议已停用）；旧的 data/、logs/ 目录不再使用，可自行删除。'
  fi

  [[ -z "$connect_override" ]] || set_setting MIAOSPEED_CONNECT "$connect_override"
  [[ -z "$token_override" ]] || set_setting MIAOSPEED_TOKEN "$token_override"
  if setting_missing MIAOSPEED_CONNECT || setting_missing MIAOSPEED_TOKEN; then
    fail "首次部署探针需要连接地址和 token：bash node-watcher.sh probe --connect 'wss://主控域名/miaospeed/reverse/<ID>' --token '<token>'（在主控面板「设置 → miaospeed 后端」添加反向后端后复制）。"
  fi
  connect_url=$(setting_value MIAOSPEED_CONNECT)

  old_name=$(setting_value MIAOSPEED_CONTAINER)
  name=${probe_name_override:-${old_name:-miaospeed}}
  [[ "$name" =~ $container_name_pattern ]] || fail ".env 中的 MIAOSPEED_CONTAINER（${name}）无效，请用 --name 重新指定。"
  # A container with this name that this script did not create would block "compose up".
  if owner=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null </dev/null); then
    if [[ "$owner" != "$name" ]]; then
      fail "已存在名为 ${name} 的容器（不是本脚本创建的，例如之前手动 docker run 的 miaospeed）。请先删除：docker rm -f ${name}，或用 --name 指定其他名称。"
    fi
  fi
  if [[ -n "$old_name" && "$old_name" != "$name" ]]; then
    docker rm -f "$old_name" </dev/null >/dev/null 2>&1 || true
  fi
  put_setting MIAOSPEED_CONTAINER "$name"
  managed_hub_image MIAOSPEED_IMAGE "$default_miaospeed_image"

  temporary_file=$(mktemp "${deploy_dir}/.compose.XXXXXX")
  write_probe_compose "$temporary_file"
  mv -- "$temporary_file" compose.deploy.yml
  temporary_file=''

  scrub_compose_env
  compose=("${compose_command[@]}" --project-name "$name" --env-file "$deploy_dir/.env" -f "$deploy_dir/compose.deploy.yml")
  "${compose[@]}" config --quiet

  master_address=$(url_authority "$connect_url")
  printf '部署目录：%s\nDocker 平台：%s\n主控地址：%s\n正在拉取 miaospeed 镜像……\n' "$deploy_dir" "$daemon_platform" "$master_address"
  if ! "${compose[@]}" pull; then
    fail "镜像拉取失败，未启动或替换容器。请检查 Docker Hub 加速（毫秒镜像 docker.1ms.run）的访问情况；配置已保留在 ${deploy_dir}/.env，可修改 MIAOSPEED_IMAGE 后重试。"
  fi
  if ! "${compose[@]}" up -d --no-build --remove-orphans; then
    "${compose[@]}" logs --tail=80 >&2 || true
    fail "探针启动失败，配置已保留在 ${deploy_dir}/.env。"
  fi

  # miaospeed logs "link established" once the master accepted the handshake.
  probe_logs=''
  state=''
  for ((attempt = 0; attempt < 20; attempt++)); do
    state=$(container_state "$name")
    probe_logs=$(docker logs --tail 60 "$name" 2>&1 </dev/null) || probe_logs=''
    case "$probe_logs" in
      *'link established'*) connected=true; break ;;
      *'signature mismatch'*|*'handshake rejected'*|*'dial failed'*|*'Invalid -connect'*|*'connection lost'*) error_seen=true; break ;;
    esac
    case "$state" in
      exited*|dead*|'') break ;;
    esac
    sleep 1
  done
  if [[ -n "$probe_logs" ]]; then
    printf '最近日志：\n%s\n' "$(printf '%s\n' "$probe_logs" | tail -n 15)"
  fi
  if [[ "$connected" != true ]]; then
    hint=$(probe_hint "$probe_logs")
    case "$state" in
      running*)
        if [[ "$error_seen" == true ]]; then
          fail "探针已启动，但暂未连上主控（容器会持续自动重试）。${hint}"
        fi
        warn "探针容器已启动，但 20 秒内未在日志中看到连接成功的记录；请稍后在主控面板「设置 → miaospeed 后端」确认是否在线。"
        ;;
      *) fail "探针容器未能保持运行，配置已保留在 ${deploy_dir}/.env。${hint}" ;;
    esac
  fi

  "${compose[@]}" ps
  if [[ "$connected" == true ]]; then
    printf '\n探针部署完成，已连接主控 %s。\n' "$master_address"
  else
    printf '\n探针部署完成，正在连接主控 %s。\n' "$master_address"
  fi
  printf '连接成功后，主控面板「设置 → miaospeed 后端」中该后端显示为在线，即可用它运行测试。\n'
  printf '配置文件：%s/.env（权限 600，包含 token）\n' "$deploy_dir"
  printf '更新探针：重新运行 bash node-watcher.sh probe（不带 --connect / --token 即沿用已保存的值）。\n'
  print_shortcut_hint
  printf '查看日志：docker logs -f --tail=100 %s\n' "$name"
}

# ---------------------------------------------------------------------------------------------
# 交互菜单
ask() {
  local __answer=''
  printf '%s' "$2"
  if ! IFS= read -r __answer; then
    if [[ -z "$__answer" ]]; then
      printf '\n'
      fail '没有更多输入，已退出。'
    fi
  fi
  __answer=${__answer%$'\r'}
  [[ -n "$__answer" ]] || __answer=${3-}
  printf -v "$1" '%s' "$__answer"
}

ask_secret() {
  local __answer=''
  printf '%s' "$2"
  if ! IFS= read -r -s __answer; then
    if [[ -z "$__answer" ]]; then
      printf '\n'
      fail '没有更多输入，已退出。'
    fi
  fi
  printf '\n'
  __answer=${__answer%$'\r'}
  printf -v "$1" '%s' "$__answer"
}

confirm() {
  local __reply
  while true; do
    ask __reply "$1 [y/n]: " "${2-}"
    case "$__reply" in
      y|Y|yes|Yes|YES) return 0 ;;
      n|N|no|No|NO) return 1 ;;
    esac
    say red ' ---> 请输入 y 或 n'
  done
}

mask() {
  if [[ ${#1} -ge 16 ]]; then
    printf '%s****%s（%s 个字符）' "${1:0:2}" "${1: -2}" "${#1}"
  else
    printf '****（%s 个字符）' "${#1}"
  fi
}

# Read a required value into an exported environment variable (DNS API credentials).
ask_env() {  # NAME prompt secret(true/false)
  local __value=''
  while true; do
    if [[ "$3" == true ]]; then ask_secret __value "$2"; else ask __value "$2"; fi
    if [[ -n "$__value" ]]; then break; fi
    say red ' ---> 不能为空，请重新输入'
  done
  if [[ "$3" == true ]]; then say green " ---> 已输入：$(mask "$__value")"; fi
  printf -v "$1" '%s' "$__value"
  export "${1?}"
}

shortcut_is_ours() {
  [[ -f "$shortcut_path" ]] && awk 'NR <= 5 && /node-watcher\.sh/ { found = 1 } END { exit !found }' "$shortcut_path" 2>/dev/null
}

install_shortcut() {
  local directory=${shortcut_path%/*}
  [[ "$shortcut_path" == /* ]] || return 1
  if [[ -e "$shortcut_path" ]] && ! shortcut_is_ours; then
    warn "${shortcut_path} 已存在且不是本脚本，未覆盖。"
    return 1
  fi
  mkdir -p "$directory"
  temporary_file=$(mktemp "${directory}/.${shortcut_name}.XXXXXX")
  if [[ -f "$0" && -r "$0" ]] && awk 'NR <= 5 && /node-watcher\.sh/ { found = 1 } END { exit !found }' "$0"; then
    cat -- "$0" > "$temporary_file"
  elif ! download "$script_url" "$temporary_file" >/dev/null 2>&1 \
    || ! awk 'NR <= 5 && /node-watcher\.sh/ { found = 1 } END { exit !found }' "$temporary_file"; then
    rm -f -- "$temporary_file"
    temporary_file=''
    warn '快捷命令安装失败：无法获取脚本，请稍后重试。'
    return 1
  fi
  chmod 755 "$temporary_file"
  mv -- "$temporary_file" "$shortcut_path"
  temporary_file=''
  return 0
}

offer_shortcut() {
  if shortcut_is_ours; then return 0; fi
  if confirm "是否安装快捷命令 ${shortcut_name}（之后输入 ${shortcut_name} 即可打开本菜单）？"; then
    if install_shortcut; then
      say green "已安装快捷命令：之后输入 ${shortcut_name} 即可打开管理菜单。"
    fi
  else
    say yellow '之后可运行 bash node-watcher.sh menu 打开管理菜单。'
  fi
  return 0
}

find_install_dir() {  # container default-dir
  local dir=''
  if command -v docker >/dev/null 2>&1; then
    dir=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$1" 2>/dev/null </dev/null) || dir=''
  fi
  if [[ "$dir" == /* && -f "$dir/compose.deploy.yml" ]]; then
    printf '%s' "$dir"
  elif [[ -f "$2/compose.deploy.yml" ]]; then
    printf '%s' "$2"
  fi
  return 0
}

master_installed_dir=''
probe_installed_dir=''
detect_installs() {
  master_installed_dir=$(find_install_dir node-watcher "$default_master_dir")
  probe_installed_dir=$(find_install_dir miaospeed "$default_probe_dir")
}

state_label() {
  case "$1" in
    running*) printf '运行中' ;;
    '') printf '容器不存在' ;;
    *) printf '已停止（%s）' "$1" ;;
  esac
}

show_banner() {
  local file state version address name connect
  detect_installs
  say red '=============================================================='
  say green "Node Watcher 一键安装 / 管理脚本  v${script_version}"
  say green "GitHub：${project_url}"
  say green '描述：节点监控面板（主控）+ miaospeed 测速探针'
  say red '--------------------------------------------------------------'
  if [[ -n "$master_installed_dir" ]]; then
    file="$master_installed_dir/.env"
    state=$(container_state node-watcher)
    version=''
    if [[ "$state" == running* ]]; then
      version=$(docker exec node-watcher node -p "require('/app/package.json').version" 2>/dev/null </dev/null) || version=''
    fi
    domain=$(setting_value NODE_WATCHER_DOMAIN "$file")
    if [[ -n "$domain" ]]; then
      https_host_port=$(setting_value HTTPS_HOST_PORT "$file")
      https_host_port=${https_host_port:-443}
      address=$(https_url)
    else
      address="端口 $(setting_value PORT "$file")"
    fi
    say green "主控（面板）：已安装 · $(state_label "$state")${version:+ · v$version} · ${address} · ${master_installed_dir}"
  else
    say yellow '主控（面板）：未安装'
  fi
  if [[ -n "$probe_installed_dir" ]]; then
    file="$probe_installed_dir/.env"
    if ! setting_missing NODE_WATCHER_JOIN "$file"; then
      say yellow "探针：旧版 nwp:// 探针（已停用）· ${probe_installed_dir}，选择 2 重新部署为 miaospeed"
    else
      name=$(setting_value MIAOSPEED_CONTAINER "$file")
      connect=$(setting_value MIAOSPEED_CONNECT "$file")
      say green "探针（miaospeed）：已安装 · $(state_label "$(container_state "${name:-miaospeed}")") · 主控 $(url_authority "$connect") · ${probe_installed_dir}"
    fi
  else
    say yellow '探针（miaospeed）：未安装'
  fi
  say red '=============================================================='
  domain=''
}

ask_directory() {  # VAR prompt-label default
  local __dir
  while true; do
    ask __dir "${2} [回车默认 ${3}]: " "$3"
    if [[ "$__dir" == /* ]]; then break; fi
    say red ' ---> 请输入以 / 开头的绝对路径'
  done
  printf -v "$1" '%s' "${__dir%/}"
  if [[ -z "${!1}" ]]; then printf -v "$1" '%s' /; fi
}

ask_port() {  # VAR prompt (empty answer keeps VAR empty)
  local __port
  while true; do
    ask __port "$2"
    if [[ -z "$__port" ]] || valid_port "$__port"; then break; fi
    say red ' ---> 端口必须为 1-65535 的整数'
  done
  if [[ -n "$__port" ]]; then __port=$((10#$__port)); fi
  printf -v "$1" '%s' "$__port"
}

menu_collect_dns() {  # env-file
  local choice provider names name valid saved
  say skyBlue '---------------- DNS 服务商 ----------------'
  say yellow '1. Cloudflare [默认]'
  say yellow '2. 阿里云'
  say yellow '3. DNSPod'
  say yellow '4. 腾讯云'
  say yellow '5. 华为云'
  say yellow '6. 其他（手动输入 acme.sh dns 名称和变量名）'
  while true; do
    ask choice '请选择 [回车默认 1]: ' 1
    case "$choice" in
      1)
        dns_provider_override=cf
        say yellow 'Cloudflare：我的个人资料 → API 令牌 → 创建令牌（模板「编辑区域 DNS」）。'
        ask_env CF_Token 'Cloudflare API Token: ' true
        break ;;
      2)
        dns_provider_override=ali
        ask_env Ali_Key '阿里云 AccessKey ID: ' false
        ask_env Ali_Secret '阿里云 AccessKey Secret: ' true
        break ;;
      3)
        dns_provider_override=dp
        ask_env DP_Id 'DNSPod API Token 的 ID: ' false
        ask_env DP_Key 'DNSPod API Token: ' true
        break ;;
      4)
        dns_provider_override=tencent
        ask_env Tencent_SecretId '腾讯云 SecretId: ' false
        ask_env Tencent_SecretKey '腾讯云 SecretKey: ' true
        break ;;
      5)
        dns_provider_override=huaweicloud
        ask_env HUAWEICLOUD_Username '华为云 IAM 用户名: ' false
        ask_env HUAWEICLOUD_Password '华为云 IAM 密码: ' true
        ask_env HUAWEICLOUD_DomainName '华为云账号名（DomainName）: ' false
        break ;;
      6)
        while true; do
          ask provider 'acme.sh DNS API 名称（dnsapi/dns_<名称>.sh 中的 <名称>，如 gd、namesilo）: '
          provider=${provider#dns_}
          if [[ "$provider" =~ $provider_pattern ]]; then break; fi
          say red ' ---> 只能包含小写字母、数字和下划线'
        done
        dns_provider_override=$provider
        while true; do
          ask names '需要的环境变量名（空格分隔，见 acme.sh 文档，如 GD_Key GD_Secret）: '
          valid=true
          for name in $names; do
            # acme.sh variables always contain an underscore (GD_Key, Namesilo_Key …).
            if ! [[ "$name" =~ ^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*$ ]]; then valid=false; fi
          done
          if [[ "$valid" == true && -n "${names// /}" ]]; then break; fi
          say red ' ---> 变量名只能包含字母、数字和下划线，例如 GD_Key'
        done
        for name in $names; do
          ask_env "$name" "${name}: " true
        done
        ACME_DNS_ENV=$names
        export ACME_DNS_ENV
        break ;;
    esac
    say red ' ---> 请输入 1-6'
  done
  saved=$(setting_value HTTPS_HOST_PORT "$1")
  ask_port https_port_override "HTTPS 端口（NAT 机器填映射到公网的端口）[回车默认 ${saved:-443}]: "
  saved=$(setting_value HTTP_HOST_PORT "$1")
  ask_port http_port_override "HTTP 端口（只用于跳转到 HTTPS）[回车默认 ${saved:-80}]: "
  return 0
}

menu_collect_domain() {  # env-file
  local value choice email
  while true; do
    ask value '域名（例如 monitor.example.com）: '
    value=$(lowercase "$value")
    if valid_domain "$value"; then break; fi
    say red ' ---> 域名格式不正确：不含 http:// 、端口和路径'
  done
  domain_override=$value
  say skyBlue '---------------- 证书申请方式 ----------------'
  say yellow '1. HTTP 验证（需要 80 端口可从公网访问）[默认]'
  say yellow '2. DNS API 验证（支持 NAT / 80 端口被封）'
  while true; do
    ask choice '请选择 [回车默认 1]: ' 1
    case "$choice" in
      1) acme_mode_override=http; break ;;
      2) acme_mode_override=dns; menu_collect_dns "$1"; break ;;
    esac
    say red ' ---> 请输入 1 或 2'
  done
  while true; do
    ask email '证书账户邮箱（可选，回车跳过）: '
    if [[ -z "$email" ]] || valid_email "$email"; then break; fi
    say red ' ---> 邮箱格式不正确'
  done
  acme_email_override=$email
  return 0
}

menu_collect_credentials() {  # env-file
  local current user password
  current=$(setting_value AUTH_USERNAME "$1")
  ask user "登录用户名 [回车默认 ${current:-admin}]: " "${current:-admin}"
  username_override=$user
  ask_secret password '登录密码 [回车自动生成]: '
  if [[ -z "$password" ]]; then
    regenerate_password=true
    say green ' ---> 将自动生成随机密码，安装完成后显示'
  else
    password_override=$password
    say green " ---> 已设置密码：$(mask "$password")"
  fi
  return 0
}

run_master_install() {
  require_arch master
  resolve_master_settings
  prepare_docker master
  deploy_master
}

menu_install_master() {
  local dir file summary current_domain current_port current_user
  say skyBlue '---------------- 安装主控（面板） ----------------'
  ask_directory dir '安装目录' "${master_installed_dir:-$default_master_dir}"
  deploy_dir=$dir
  file="$dir/.env"
  if [[ -f "$file" ]] && ! setting_missing AUTH_PASSWORD "$file"; then
    current_domain=$(setting_value NODE_WATCHER_DOMAIN "$file")
    current_port=$(setting_value PORT "$file")
    current_user=$(setting_value AUTH_USERNAME "$file")
    if [[ -n "$current_domain" ]]; then summary="域名 ${current_domain}（HTTPS）"; else summary="面板端口 ${current_port:-随机}"; fi
    summary+=" · 用户名 ${current_user:-admin} · 密码保持不变"
    say yellow "读取到上次安装的配置：${summary}"
    if confirm '是否使用上次安装的配置？'; then
      run_master_install
      offer_shortcut
      return 0
    fi
  fi
  if confirm '是否使用域名并申请 HTTPS 证书？（探针走公网反向连接时需要）'; then
    menu_collect_domain "$file"
  else
    if [[ -n "$(setting_value NODE_WATCHER_DOMAIN "$file")" ]]; then no_domain=true; fi
    current_port=$(setting_value PORT "$file")
    if [[ -n "$current_port" ]]; then
      ask_port port_override "面板端口 [回车保留 ${current_port}]: "
    else
      ask_port port_override '面板端口 [回车随机选择 1000-10000]: '
    fi
  fi
  menu_collect_credentials "$file"
  run_master_install
  offer_shortcut
}

run_probe_install() {
  require_arch probe
  resolve_probe_settings
  prepare_docker probe
  deploy_probe
}

menu_deploy_probe() {
  local dir file connect token
  say skyBlue '---------------- 部署探针（miaospeed 反向连接） ----------------'
  ask_directory dir '部署目录' "${probe_installed_dir:-$default_probe_dir}"
  deploy_dir=$dir
  file="$dir/.env"
  if [[ -f "$file" ]] && ! setting_missing MIAOSPEED_CONNECT "$file" && ! setting_missing MIAOSPEED_TOKEN "$file"; then
    say yellow "读取到已部署的探针：主控 $(url_authority "$(setting_value MIAOSPEED_CONNECT "$file")")"
    if confirm '是否沿用已保存的连接地址和 token？'; then
      run_probe_install
      offer_shortcut
      return 0
    fi
  fi
  say yellow '连接地址和 token 在主控面板「设置 → miaospeed 后端 → 添加反向后端」中生成。'
  while true; do
    ask connect '连接地址（wss://主控域名/miaospeed/reverse/<ID>）: '
    if valid_connect "$connect"; then break; fi
    say red " ---> ${connect_hint}"
  done
  while true; do
    ask_secret token 'token: '
    if valid_token "$token"; then break; fi
    say red " ---> ${token_hint}"
  done
  say green " ---> 已输入 token：$(mask "$token")"
  connect_override=$connect
  token_override=$token
  run_probe_install
  offer_shortcut
}

master_compose_for() {  # dir
  compose=("${compose_command[@]}" --project-name node-watcher --env-file "$1/.env" -f "$1/compose.deploy.yml")
}

probe_compose_for() {  # dir
  local name
  if ! setting_missing NODE_WATCHER_JOIN "$1/.env"; then
    name=node-watcher-probe
  else
    name=$(setting_value MIAOSPEED_CONTAINER "$1/.env")
    name=${name:-miaospeed}
  fi
  compose=("${compose_command[@]}" --project-name "$name" --env-file "$1/.env" -f "$1/compose.deploy.yml")
}

show_certificate_info() {
  local file=data/tls/fullchain.pem enddate subject issuer
  if [[ ! -s "$file" ]]; then
    say yellow '证书：尚未申请成功（data/tls/fullchain.pem 不存在）'
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    say yellow '证书：已存在（未安装 openssl，无法读取详情）'
    return 0
  fi
  subject=$(openssl x509 -in "$file" -noout -subject 2>/dev/null) || subject=''
  issuer=$(openssl x509 -in "$file" -noout -issuer 2>/dev/null) || issuer=''
  enddate=$(openssl x509 -in "$file" -noout -enddate 2>/dev/null) || enddate=''
  if [[ -z "$enddate" ]]; then
    say red '证书：data/tls/fullchain.pem 无法解析'
    return 0
  fi
  say green "证书主题：${subject#subject=}"
  say green "签发机构：${issuer#issuer=}"
  if ! openssl x509 -in "$file" -noout -checkend 0 >/dev/null 2>&1; then
    say red "到期时间：${enddate#notAfter=}（已过期）"
  elif ! openssl x509 -in "$file" -noout -checkend 2592000 >/dev/null 2>&1; then
    say yellow "到期时间：${enddate#notAfter=}（30 天内到期，acme.sh 会自动续期）"
  else
    say green "到期时间：${enddate#notAfter=}"
  fi
  return 0
}

menu_certificate() {
  local choice
  [[ -n "$master_installed_dir" ]] || fail '未检测到已安装的主控，请先选择 1 安装主控。'
  deploy_dir=$master_installed_dir
  cd "$deploy_dir"
  say skyBlue '---------------- 证书管理 ----------------'
  if [[ -z "$(setting_value NODE_WATCHER_DOMAIN)" ]]; then
    say yellow '当前主控未使用域名。需要 HTTPS 时请选择 1 重新安装主控，并在提示时开启域名。'
    return 0
  fi
  resolve_master_settings
  say green "域名：${domain}（$([[ "$acme_mode" == dns ]] && printf 'DNS 验证 dns_%s' "$dns_provider" || printf 'HTTP 验证')）"
  show_certificate_info
  say yellow '1. 申请 / 重新申请证书（未到期时自动跳过）'
  say yellow '2. 强制重新申请证书'
  say yellow '0. 退出'
  while true; do
    ask choice '请选择: '
    case "$choice" in
      1|2) break ;;
      0) return 0 ;;
    esac
    say red ' ---> 请输入 0-2'
  done
  require_docker_tools
  master_compose_for "$deploy_dir"
  scrub_compose_env
  "${compose[@]}" up -d --no-build acme
  if [[ "$choice" == 2 ]]; then issue_certificate true || true; else issue_certificate false || true; fi
  if certificate_ready && [[ "$(setting_value AUTH_COOKIE_SECURE)" != true ]]; then
    set_setting AUTH_COOKIE_SECURE true
    start_master
  fi
  show_certificate_info
}

menu_change_credentials() {
  local file current_port current_user port user password
  [[ -n "$master_installed_dir" ]] || fail '未检测到已安装的主控，请先选择 1 安装主控。'
  deploy_dir=$master_installed_dir
  file="$deploy_dir/.env"
  say skyBlue '---------------- 修改面板端口 / 登录密码 ----------------'
  if [[ -n "$(setting_value NODE_WATCHER_DOMAIN "$file")" ]]; then
    say yellow "当前使用域名 $(setting_value NODE_WATCHER_DOMAIN "$file")，面板通过 HTTP / HTTPS 端口访问，此处不修改端口。"
  else
    current_port=$(setting_value PORT "$file")
    ask_port port "新的面板端口 [回车不修改，当前 ${current_port:-未设置}]: "
    port_override=$port
  fi
  current_user=$(setting_value AUTH_USERNAME "$file")
  ask user "新的登录用户名 [回车不修改，当前 ${current_user:-admin}]: "
  username_override=$user
  ask_secret password '新的登录密码 [回车不修改，输入 r 随机生成]: '
  case "$password" in
    '') ;;
    r|R) regenerate_password=true ;;
    *) password_override=$password; say green " ---> 已设置密码：$(mask "$password")" ;;
  esac
  if [[ -z "$port_override$username_override$password_override" && "$regenerate_password" == false ]]; then
    say yellow '未做任何修改。'
    return 0
  fi
  run_master_install
}

menu_status() {
  if [[ -z "$master_installed_dir$probe_installed_dir" ]]; then
    say yellow '未检测到已安装的主控或探针。'
    return 0
  fi
  require_docker_tools
  if [[ -n "$master_installed_dir" ]]; then
    say skyBlue "---------------- 主控：${master_installed_dir} ----------------"
    master_compose_for "$master_installed_dir"
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=50 || true
  fi
  if [[ -n "$probe_installed_dir" ]]; then
    say skyBlue "---------------- 探针：${probe_installed_dir} ----------------"
    probe_compose_for "$probe_installed_dir"
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=50 || true
  fi
  return 0
}

menu_update() {
  if [[ -z "$master_installed_dir$probe_installed_dir" ]]; then
    say yellow '未检测到已安装的主控或探针，请先选择 1 或 2 安装。'
    return 0
  fi
  if [[ -n "$master_installed_dir" ]]; then
    say skyBlue '---------------- 更新主控 ----------------'
    deploy_dir=$master_installed_dir
    run_master_install
  fi
  if [[ -n "$probe_installed_dir" ]]; then
    say skyBlue '---------------- 更新探针 ----------------'
    deploy_dir=$probe_installed_dir
    run_probe_install
  fi
  return 0
}

uninstall_master() {
  local keep=false
  if confirm '是否保留数据（data/ 中的订阅、历史记录和证书，以及 .env 登录配置）？'; then keep=true; fi
  cd "$master_installed_dir"
  master_compose_for "$master_installed_dir"
  scrub_compose_env
  "${compose[@]}" down --remove-orphans || warn '停止容器失败，请检查 Docker 状态。'
  rm -f -- compose.deploy.yml
  if [[ "$keep" == true ]]; then
    say green "主控已卸载，数据和配置保留在 ${master_installed_dir}，重新安装时会自动读取。"
  else
    rm -rf -- data logs acme
    rm -f -- .env acme.env
    cd /
    rmdir -- "$master_installed_dir" 2>/dev/null || true
    say green '主控已卸载，数据已删除。'
  fi
  master_installed_dir=''
}

uninstall_probe() {
  cd "$probe_installed_dir"
  probe_compose_for "$probe_installed_dir"
  scrub_compose_env
  "${compose[@]}" down --remove-orphans || warn '停止容器失败，请检查 Docker 状态。'
  rm -f -- compose.deploy.yml .env
  cd /
  rmdir -- "$probe_installed_dir" 2>/dev/null || true
  say green '探针已卸载。'
  probe_installed_dir=''
}

menu_uninstall() {
  local choice label
  if [[ -z "$master_installed_dir$probe_installed_dir" ]]; then
    say yellow '未检测到已安装的主控或探针。'
    return 0
  fi
  say skyBlue '---------------- 卸载 ----------------'
  say yellow '1. 卸载主控（面板）'
  say yellow '2. 卸载探针（miaospeed）'
  say yellow '3. 全部卸载'
  say yellow '0. 退出'
  while true; do
    ask choice '请选择: '
    case "$choice" in
      0) return 0 ;;
      1) [[ -n "$master_installed_dir" ]] && { label='主控'; break; }; say red ' ---> 未安装主控' ;;
      2) [[ -n "$probe_installed_dir" ]] && { label='探针'; break; }; say red ' ---> 未安装探针' ;;
      3) label='主控和探针'; break ;;
      *) say red ' ---> 请输入 0-3' ;;
    esac
  done
  confirm "确认卸载${label}？" || return 0
  confirm "再次确认：将停止并删除${label}的容器，是否继续？" || return 0
  require_docker_tools
  if [[ "$choice" != 2 && -n "$master_installed_dir" ]]; then uninstall_master; fi
  if [[ "$choice" != 1 && -n "$probe_installed_dir" ]]; then uninstall_probe; fi
  if [[ -z "$master_installed_dir$probe_installed_dir" ]] && shortcut_is_ours; then
    rm -f -- "$shortcut_path"
    say green "已删除快捷命令 ${shortcut_name}。"
  fi
  return 0
}

run_menu() {
  local choice
  show_banner
  say skyBlue '---------------- 安装 ----------------'
  say yellow '1. 安装 / 重新安装主控（面板）'
  say yellow '2. 部署探针（miaospeed 反向连接）'
  say skyBlue '---------------- 管理 ----------------'
  say yellow '3. 证书管理（申请 / 重新申请 / 查看到期时间）'
  say yellow '4. 修改面板端口 / 登录密码'
  say yellow '5. 查看运行状态与日志'
  say yellow '6. 更新（拉取最新镜像并重启）'
  say skyBlue '---------------- 脚本 ----------------'
  say yellow '7. 卸载（停止并删除容器，可选保留数据）'
  say yellow '0. 退出'
  say red '=============================================================='
  while true; do
    ask choice '请选择: '
    case "$choice" in
      1) menu_install_master; return 0 ;;
      2) menu_deploy_probe; return 0 ;;
      3) menu_certificate; return 0 ;;
      4) menu_change_credentials; return 0 ;;
      5) menu_status; return 0 ;;
      6) menu_update; return 0 ;;
      7) menu_uninstall; return 0 ;;
      0) say green '已退出。'; return 0 ;;
    esac
    say red ' ---> 请输入菜单中的编号（0-7）'
  done
}

# ---------------------------------------------------------------------------------------------
case "$mode" in
  menu) run_menu ;;
  probe)
    resolve_probe_settings
    prepare_docker probe
    deploy_probe
    ;;
  *)
    resolve_master_settings
    prepare_docker master
    deploy_master
    ;;
esac
