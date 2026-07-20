#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
MEDUSA_DIR="$ROOT_DIR/apps/medusa"
MEDUSA_BACKEND_DIR="$MEDUSA_DIR/apps/backend"

fail() {
  echo ""
  echo "preflight failed: $1"
  echo ""
  exit 1
}

echo "==> preflight: 检查本地环境"

if [ ! -f "$WEB_DIR/.env.local" ]; then
  fail "缺少 apps/web/.env.local，请先运行：./scripts/bootstrap-local.sh"
fi

if [ ! -f "$MEDUSA_BACKEND_DIR/.env" ]; then
  fail "缺少 apps/medusa/apps/backend/.env，请先运行：./scripts/bootstrap-local.sh"
fi

if [ ! -f "$WEB_DIR/node_modules/.bin/next" ]; then
  fail "web 依赖未安装（next 不存在）。请运行：npm --prefix \"$WEB_DIR\" install"
fi

if [ ! -d "$MEDUSA_DIR/node_modules" ]; then
  fail "medusa 依赖未安装。请运行：npm --prefix \"$MEDUSA_DIR\" install"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "warning: 未检测到 docker。Medusa 本地基础设施（Postgres/Redis）可能无法启动。"
fi

if ! grep -Eq '^MEDUSA_API_KEY=.+' "$WEB_DIR/.env.local"; then
  echo "warning: apps/web/.env.local 未配置 MEDUSA_API_KEY。/order/[id] 将优先显示本地下单快照，而不是 Medusa 实时订单状态。"
fi

echo "preflight ok"
