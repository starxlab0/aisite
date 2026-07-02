#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
MEDUSA_DIR="$ROOT_DIR/apps/medusa"

cleanup() {
  jobs -p | xargs -r kill >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "==> 启动 Medusa backend"
npm --prefix "$MEDUSA_DIR" run backend:dev &
MEDUSA_PID=$!

echo "==> 启动 Next.js web"
npm --prefix "$WEB_DIR" run dev &
WEB_PID=$!

echo ""
echo "服务启动中："
echo "- Medusa backend: http://localhost:9000"
echo "- Medusa admin:   http://localhost:9000/app"
echo "- Web frontend:   http://localhost:3000"
echo ""
echo "按 Ctrl+C 可停止全部服务。"

wait "$MEDUSA_PID" "$WEB_PID"

