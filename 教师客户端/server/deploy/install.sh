#!/usr/bin/env bash
# install.sh — edu-teacher-api 腾讯云轻量机（Ubuntu）一键部署（D03 附录 A）
# 用法（root）：bash install.sh [APP_DIR]
#   APP_DIR 默认 /opt/loongedutools  （仓库根，含 教师客户端/server）
# 幂等：可重复执行（已装依赖/已建 unit 时自动跳过）
set -euo pipefail

APP_ROOT="${1:-/opt/loongedutools}"
SERVER_DIR="$APP_ROOT/教师客户端/server"
UNIT_SRC="$SERVER_DIR/deploy/edu-teacher-api.service"
ENV_DST="/etc/edu-teacher-api.env"

echo "== edu-teacher-api install =="
echo "APP_ROOT=$APP_ROOT"

# 1. Node ≥ 22（node:sqlite 需要；Ubuntu 22.04 自带 12 → 用 NodeSource）
if ! command -v node >/dev/null || [ "$(node -e 'process.exit(process.versions.node.split(".")[0]>=22?0:1)')" != "0" ]; then
  echo "[1/5] installing Node 22 (NodeSource)..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "[1/5] node $(node -v) ✓"

# 2. 依赖
cd "$SERVER_DIR"
if [ ! -d node_modules ]; then
  echo "[2/5] npm ci..."
  npm ci
else
  echo "[2/5] node_modules exists ✓"
fi

# 3. 密钥文件（不存在则从模板生成 + 随机填 JWT/PKG_ADMIN_KEY）
if [ ! -f "$ENV_DST" ]; then
  echo "[3/5] creating $ENV_DST (600) with random secrets..."
  install -m 600 deploy/edu-teacher-api.env.example "$ENV_DST"
  JWT=$(openssl rand -base64 48)
  PKG=$(openssl rand -base64 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" "$ENV_DST"
  sed -i "s|^PKG_ADMIN_KEY=.*|PKG_ADMIN_KEY=$PKG|" "$ENV_DST"
  # LICENSE_SIGN_KEY：若 scripts/keys/ 已有 ed25519 私钥则导入，否则留空（启动 warning，口令包临时自签）
  KEYFILE="$SERVER_DIR/keys/license-sign.key"
  if [ -f "$KEYFILE" ]; then
    PEM=$(awk 'BEGIN{ORS="\\n"}1' "$KEYFILE")
    sed -i "s|^LICENSE_SIGN_KEY=.*|LICENSE_SIGN_KEY=$PEM|" "$ENV_DST"
  else
    echo "  ⚠ LICENSE_SIGN_KEY 为空（临时自签，仅供联调）。生产务必生成并回填，见 deploy/README.md"
  fi
else
  echo "[3/5] $ENV_DST exists ✓ (not overwritten)"
fi

# 4. systemd unit（按 APP_ROOT 改 WorkingDirectory 后安装）
echo "[4/5] installing systemd unit..."
sed "s|^WorkingDirectory=.*|WorkingDirectory=$SERVER_DIR|" "$UNIT_SRC" \
  > /etc/systemd/system/edu-teacher-api.service
systemctl daemon-reload
systemctl enable edu-teacher-api >/dev/null 2>&1 || true

# 5. 启动 + 健康检查（迁移由 main.ts 启动时自动执行）
echo "[5/5] starting service..."
systemctl restart edu-teacher-api
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/api/edu/health >/dev/null 2>&1; then
    echo "== OK: health 200 =="
    echo "next: Caddy/nginx 反代 443 → 127.0.0.1:8787（见 deploy/caddy.example），"
    echo "      备份 cron 见 deploy/backup.sh，"
    echo "      激活码 seed 见 deploy/README.md"
    exit 0
  fi
  sleep 1
done
echo "== FAIL: health timeout, journalctl -u edu-teacher-api -n 50 ==" >&2
journalctl -u edu-teacher-api -n 50 --no-pager >&2 || true
exit 1
