#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.deploy"
PRODUCTION_ENV_FILE="$ROOT_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 .env.deploy，请先复制 .env.deploy.example 并填入真实值"
  exit 1
fi

if [ ! -f "$PRODUCTION_ENV_FILE" ]; then
  echo "❌ 未找到 .env.production，请先复制 .env.production.example 并填入真实值"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

cd "$ROOT_DIR"

require_env() {
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "❌ 缺少必填环境变量: $name"
      exit 1
    fi
  done
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ 未找到命令: $1"
    exit 1
  fi
}

require_env SERVER_IP SERVER_USER SSH_PORT PROJECT_PATH

REMOTE_SUDO="${REMOTE_SUDO:-1}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
DEPLOY_CHECKS="${DEPLOY_CHECKS:-1}"
IMAGE_REPO="${IMAGE_REPO:-grove-app}"
VERSION="$(date +%Y%m%d_%H%M%S)"
VERSIONED_IMAGE="${IMAGE_REPO}:${VERSION}"
LATEST_IMAGE="${IMAGE_REPO}:latest"
LOCAL_IMAGE_ARCHIVE="/tmp/${IMAGE_REPO//\//-}_${VERSION}.tar.gz"
IMAGE_ARCHIVE_NAME="$(basename "$LOCAL_IMAGE_ARCHIVE")"
REMOTE_TMP_DIR="${REMOTE_TMP_DIR:-/tmp/grove-deploy}"
SSH_TARGET="${SERVER_USER}@${SERVER_IP}"
APP_PORT_VALUE="$(sed -n 's/^APP_PORT=//p' "$PRODUCTION_ENV_FILE" | tail -n 1)"
APP_PUBLIC_URL="$(sed -n 's/^APP_PUBLIC_URL=//p' "$PRODUCTION_ENV_FILE" | tail -n 1)"
TRAEFIK_NETWORK_VALUE="$(sed -n 's/^TRAEFIK_NETWORK=//p' "$PRODUCTION_ENV_FILE" | tail -n 1)"
CONTROL_PATH="/tmp/${IMAGE_REPO//\//-}_${SERVER_IP//[^[:alnum:]]/_}_${SSH_PORT}.sock"

if [ -z "$APP_PORT_VALUE" ]; then
  APP_PORT_VALUE=3000
fi

if [ -z "$APP_PUBLIC_URL" ]; then
  APP_PUBLIC_URL="http://$SERVER_IP:$APP_PORT_VALUE"
fi

if [ -z "$TRAEFIK_NETWORK_VALUE" ]; then
  TRAEFIK_NETWORK_VALUE="atmosphere_network"
fi

cleanup() {
  rm -f "$LOCAL_IMAGE_ARCHIVE"

  if [ -S "$CONTROL_PATH" ]; then
    ssh -S "$CONTROL_PATH" -O exit "$SSH_TARGET" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

require_command docker
require_command ssh
require_command scp
require_command pnpm

echo ""
echo "🚀 开始部署 Grove"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 版本: $VERSION"
echo "🖥️  目标: $SSH_TARGET"
echo "📁 目录: $PROJECT_PATH"
echo ""

echo "🔗 检测 SSH 连通性..."
if ! ssh \
  -p "$SSH_PORT" \
  -o ConnectTimeout=5 \
  -o ControlMaster=auto \
  -o ControlPath="$CONTROL_PATH" \
  -o ControlPersist=10m \
  "$SSH_TARGET" \
  exit; then
  echo "❌ SSH 连接失败，请检查 .env.deploy、SSH 登录凭据和 known_hosts 配置"
  exit 1
fi
echo "✅ SSH 连接正常"

if [ "$DEPLOY_CHECKS" = "1" ]; then
  echo ""
  echo "🧪 执行发布前检查..."
  pnpm format:check
  pnpm lint
  pnpm typecheck
  echo "✅ 发布前检查通过"
fi

echo ""
echo "🔨 构建生产镜像..."
docker build \
  --platform "$DOCKER_PLATFORM" \
  --target production \
  -t "$VERSIONED_IMAGE" \
  -t "$LATEST_IMAGE" \
  .
echo "✅ 镜像构建完成"

echo ""
echo "📤 打包并上传镜像..."
docker save "$VERSIONED_IMAGE" "$LATEST_IMAGE" | gzip > "$LOCAL_IMAGE_ARCHIVE"
echo "   本地镜像包大小: $(du -sh "$LOCAL_IMAGE_ARCHIVE" | cut -f1)"

ssh \
  -p "$SSH_PORT" \
  -o ControlPath="$CONTROL_PATH" \
  "$SSH_TARGET" \
  "rm -rf '$REMOTE_TMP_DIR' && mkdir -p '$REMOTE_TMP_DIR'"
scp \
  -P "$SSH_PORT" \
  -o ControlPath="$CONTROL_PATH" \
  "$LOCAL_IMAGE_ARCHIVE" \
  "$SSH_TARGET:$REMOTE_TMP_DIR/"
scp \
  -P "$SSH_PORT" \
  -o ControlPath="$CONTROL_PATH" \
  "$ROOT_DIR/docker-compose.prod.yml" \
  "$SSH_TARGET:$REMOTE_TMP_DIR/"
scp \
  -P "$SSH_PORT" \
  -o ControlPath="$CONTROL_PATH" \
  "$PRODUCTION_ENV_FILE" \
  "$SSH_TARGET:$REMOTE_TMP_DIR/"
echo "✅ 上传完成"

echo ""
echo "🔄 在服务器上发布..."
ssh \
  -p "$SSH_PORT" \
  -o ControlPath="$CONTROL_PATH" \
  "$SSH_TARGET" \
  "PROJECT_PATH='$PROJECT_PATH' REMOTE_TMP_DIR='$REMOTE_TMP_DIR' VERSION='$VERSION' IMAGE_REPO='$IMAGE_REPO' IMAGE_ARCHIVE_NAME='$IMAGE_ARCHIVE_NAME' REMOTE_SUDO='$REMOTE_SUDO' TRAEFIK_NETWORK_VALUE='$TRAEFIK_NETWORK_VALUE' APP_PORT_VALUE='$APP_PORT_VALUE' bash -s" <<'EOF'
set -euo pipefail

run_with_sudo() {
  if [ "$REMOTE_SUDO" = "1" ]; then
    sudo "$@"
  else
    "$@"
  fi
}

compose() {
  if [ "$REMOTE_SUDO" = "1" ]; then
    sudo docker compose --env-file "$PROJECT_PATH/.env.production" -f "$PROJECT_PATH/docker-compose.prod.yml" "$@"
  else
    docker compose --env-file "$PROJECT_PATH/.env.production" -f "$PROJECT_PATH/docker-compose.prod.yml" "$@"
  fi
}

docker_inspect() {
  if [ "$REMOTE_SUDO" = "1" ]; then
    sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo "missing"
  else
    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo "missing"
  fi
}

print_diagnostics() {
  echo ""
  echo "📋 当前容器状态"
  compose ps -a || true
  echo ""
  echo "📜 应用最近日志"
  compose logs --tail=100 app || true
}

fail_with_diagnostics() {
  echo "❌ $1"
  print_diagnostics
  exit 1
}

wait_for_healthy() {
  service_name="$1"
  service_label="$2"
  max_attempts="${3:-20}"

  for attempt in $(seq 1 "$max_attempts"); do
    container_id="$(compose ps -q "$service_name" | tail -n 1)"

    if [ -z "$container_id" ]; then
      container_status="missing"
    else
      container_status="$(docker_inspect "$container_id")"
    fi

    if [ "$container_status" = "healthy" ]; then
      return 0
    fi

    if [ "$attempt" -eq "$max_attempts" ]; then
      fail_with_diagnostics "$service_label 健康检查未通过，最终状态: $container_status"
    fi

    echo "   等待${service_label}就绪... [$attempt/$max_attempts] 状态: $container_status"
    sleep 3
  done
}

run_with_sudo mkdir -p "$PROJECT_PATH"
run_with_sudo install -Dm644 "$REMOTE_TMP_DIR/docker-compose.prod.yml" "$PROJECT_PATH/docker-compose.prod.yml"
run_with_sudo install -Dm600 "$REMOTE_TMP_DIR/.env.production" "$PROJECT_PATH/.env.production"

if [ "$REMOTE_SUDO" = "1" ]; then
  sudo docker network inspect "$TRAEFIK_NETWORK_VALUE" >/dev/null 2>&1 || sudo docker network create "$TRAEFIK_NETWORK_VALUE" >/dev/null
else
  docker network inspect "$TRAEFIK_NETWORK_VALUE" >/dev/null 2>&1 || docker network create "$TRAEFIK_NETWORK_VALUE" >/dev/null
fi

if [ "$REMOTE_SUDO" = "1" ]; then
  sudo sh -c "docker load < '$REMOTE_TMP_DIR/$IMAGE_ARCHIVE_NAME'"
  sudo docker tag "$IMAGE_REPO:$VERSION" "$IMAGE_REPO:latest"
else
  docker load < "$REMOTE_TMP_DIR/$IMAGE_ARCHIVE_NAME"
  docker tag "$IMAGE_REPO:$VERSION" "$IMAGE_REPO:latest"
fi

if ! compose up -d postgres; then
  fail_with_diagnostics "PostgreSQL 启动命令执行失败"
fi

wait_for_healthy postgres PostgreSQL

if ! compose up -d app; then
  fail_with_diagnostics "应用启动命令执行失败"
fi

APP_CONTAINER_ID="$(compose ps -q app | tail -n 1)"
if [ -z "$APP_CONTAINER_ID" ]; then
  fail_with_diagnostics "应用容器未创建成功"
fi

wait_for_healthy app 应用

if ! compose exec -T app pnpm migration:run:prod; then
  fail_with_diagnostics "数据库迁移执行失败"
fi

if ! run_with_sudo bash -lc "exec 3<>/dev/tcp/127.0.0.1/$APP_PORT_VALUE"; then
  fail_with_diagnostics "宿主机回环端口 127.0.0.1:$APP_PORT_VALUE 未监听"
fi

if [ "$REMOTE_SUDO" = "1" ]; then
  sudo docker image ls "$IMAGE_REPO" --format '{{.Tag}}' | \
    grep -E '^[0-9]{8}_[0-9]{6}$' | \
    sort -r | \
    tail -n +4 | \
    xargs -I {} sudo docker rmi "$IMAGE_REPO:{}" >/dev/null 2>&1 || true
else
  docker image ls "$IMAGE_REPO" --format '{{.Tag}}' | \
    grep -E '^[0-9]{8}_[0-9]{6}$' | \
    sort -r | \
    tail -n +4 | \
    xargs -I {} docker rmi "$IMAGE_REPO:{}" >/dev/null 2>&1 || true
fi

rm -rf "$REMOTE_TMP_DIR"
EOF

echo ""
echo "🧹 清理本地旧镜像..."
docker image ls "$IMAGE_REPO" --format '{{.Tag}}' | \
  grep -E '^[0-9]{8}_[0-9]{6}$' | \
  sort -r | \
  tail -n +4 | \
  xargs -I {} docker rmi "$IMAGE_REPO:{}" >/dev/null 2>&1 || true

echo ""
echo "✅ 部署完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 版本: $VERSION"
echo "🌐 网关地址: $APP_PUBLIC_URL/health"
echo "🧪 本机回环: ssh -p $SSH_PORT $SSH_TARGET 'curl http://127.0.0.1:$APP_PORT_VALUE/health'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
