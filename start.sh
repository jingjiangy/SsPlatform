#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT}/logs"

BACK_PORT=8077
ENV_FILE="${ROOT}/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  val="$(grep -m1 "^PORT=" "$ENV_FILE" | cut -d= -f2)"
  [[ -n "$val" ]] && BACK_PORT="$val"
fi

mkdir -p "$LOG_DIR"
lsof -ti :"${BACK_PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "==> 构建前端..."
npm --prefix "${ROOT}/frontend" ci --silent
npm --prefix "${ROOT}/frontend" run build

echo "==> 安装后端依赖..."
pip install -q -r "${ROOT}/requirements.txt" -i https://mirrors.aliyun.com/pypi/simple/

echo "==> 启动后端..."
> "${LOG_DIR}/backend.log"
(cd "${ROOT}/backend" && python run.py >> "${LOG_DIR}/backend.log" 2>&1) &


echo ""
echo "后端日志: ${LOG_DIR}/backend.log"
