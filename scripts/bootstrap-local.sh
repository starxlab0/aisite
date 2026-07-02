#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
MEDUSA_DIR="$ROOT_DIR/apps/medusa"
MEDUSA_BACKEND_DIR="$MEDUSA_DIR/apps/backend"

echo "==> 准备本地开发环境"

if [ ! -f "$MEDUSA_BACKEND_DIR/.env" ]; then
  cp "$MEDUSA_BACKEND_DIR/.env.template" "$MEDUSA_BACKEND_DIR/.env"
  echo "已创建 $MEDUSA_BACKEND_DIR/.env"
else
  echo "已存在 $MEDUSA_BACKEND_DIR/.env，跳过"
fi

if [ ! -f "$WEB_DIR/.env.local" ]; then
  cp "$WEB_DIR/.env.example" "$WEB_DIR/.env.local"
  echo "已创建 $WEB_DIR/.env.local"
else
  echo "已存在 $WEB_DIR/.env.local，跳过"
fi

echo "==> 安装 web 依赖"
npm --prefix "$WEB_DIR" install

echo "==> 安装 medusa 依赖"
npm --prefix "$MEDUSA_DIR" install

echo "==> 启动本地基础设施（Postgres / Redis）"
npm --prefix "$MEDUSA_DIR" run infra:up

cat <<EOF

本地环境准备完成。

下一步建议依次执行：

1. 跑数据库迁移
   cd $MEDUSA_DIR
   npm run backend:migrate

2. 创建管理员
   cd $MEDUSA_DIR
   npm run backend:user -- -e admin@example.com -p supersecret

3. 灌入本地测试商品
   cd $MEDUSA_DIR
   npm run backend:seed:local

4. 启动全部开发服务
   cd $ROOT_DIR
   npm run dev:all

EOF
