#!/usr/bin/env bash
# backup.sh — edu-teacher-api 数据备份（D03 附录 A.4）
# SQLite 在线备份（不锁库）+ r2 目录打包，保留 14 天
# cron 示例（每天 03:00）：0 3 * * * /opt/loongedutools/教师客户端/server/deploy/backup.sh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"           # → 教师客户端/server
SERVER_DIR="$APP_ROOT"
DATA_DIR="$SERVER_DIR/data"
BAK_DIR="${BACKUP_DIR:-$DATA_DIR/backup}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BAK_DIR"

# 1. SQLite 在线备份（sqlite3 CLI；无 CLI 时退回文件拷贝）
DB="$DATA_DIR/app.db"
if [ -f "$DB" ]; then
  if command -v sqlite3 >/dev/null; then
    sqlite3 "$DB" ".backup '$BAK_DIR/app-$STAMP.db'"
  else
    cp "$DB" "$BAK_DIR/app-$STAMP.db"
  fi
  echo "[backup] db → $BAK_DIR/app-$STAMP.db"
fi

# 2. r2 内容包（可由发布管线重推，打包仅为加速恢复）
if [ -d "$DATA_DIR/r2" ]; then
  tar -czf "$BAK_DIR/r2-$STAMP.tar.gz" -C "$DATA_DIR" r2
  echo "[backup] r2 → $BAK_DIR/r2-$STAMP.tar.gz"
fi

# 3. 保留期内清理
find "$BAK_DIR" -name "app-*.db" -mtime +"$KEEP_DAYS" -delete
find "$BAK_DIR" -name "r2-*.tar.gz" -mtime +"$KEEP_DAYS" -delete
echo "[backup] done (keep ${KEEP_DAYS}d)"
