#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 从 backend/.env 读取配置 ──────────────────────────────────────────────────
ENV_FILE="${ROOT}/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    [[ -z "${!key+x}" ]] && export "$key"="$val"
  done < "$ENV_FILE"
fi

BACK_PORT="${PORT:-8077}"
FRONT_PORT="${FRONT_PORT:-5173}"

# ── 获取局域网 IP ─────────────────────────────────────────────────────────────
detect_lan_ip() {
  local ip=""
  [[ "$(uname -s)" == "Darwin" ]] && {
    for iface in en0 en1 en2 en3; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [[ -n "$ip" ]] && break
    done
  }
  [[ -z "$ip" ]] && command -v ip &>/dev/null && \
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}')"
  [[ -z "$ip" ]] && command -v hostname &>/dev/null && \
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -n "$ip" && "$ip" != "127.0.0.1" ]] && echo "$ip" || true
}

LAN_IP="$(detect_lan_ip || true)"

# ── 启动 ──────────────────────────────────────────────────────────────────────
cleanup() {
  kill "${BACK_PID:-}" "${FRONT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pkill -9 python 2>/dev/null || true

(cd "${ROOT}/backend" && python main.py) &
BACK_PID=$!

npm --prefix "${ROOT}/frontend" run dev -- --port "${FRONT_PORT}" --host 0.0.0.0 &
FRONT_PID=$!

SCHEME="http"
[[ -f "${ROOT}/frontend/certs/localhost-key.pem" ]] && SCHEME="https"

echo ""
echo "======================================================"
echo "  API 文档   http://127.0.0.1:${BACK_PORT}/docs"
echo "  前端       ${SCHEME}://localhost:${FRONT_PORT}/login"
[[ -n "${LAN_IP}" ]] && echo "  局域网     ${SCHEME}://${LAN_IP}:${FRONT_PORT}/login"
echo "======================================================"
echo "  Ctrl+C 停止服务"
echo ""
wait
