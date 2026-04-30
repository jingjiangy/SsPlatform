#!/usr/bin/env bash
# 同时启动 FastAPI 后端与 Vue 前端（开发模式）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_PORT="${BACK_PORT:-8077}"
FRONT_PORT="${FRONT_PORT:-5173}"

# 本机局域网 IPv4（用于手机等同网段访问；获取失败则留空）
detect_lan_ip() {
  local ip=""
  if [[ "$(uname -s)" == "Darwin" ]]; then
    for iface in en0 en1 en2 en3 en4 en5 en6; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [[ -n "$ip" ]] && break
    done
  fi
  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  fi
  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -n "$ip" ]] && [[ "$ip" != "127.0.0.1" ]]; then
    echo "$ip"
  fi
}

LAN_IP="$(detect_lan_ip || true)"

# 若缺少 Vite 开发 https 所需自签证书，则在本脚本内自动生成（与 frontend/scripts/gen-dev-https-cert.sh 逻辑一致）
ensure_dev_https_certs() {
  local KEY CRT SAN rc
  KEY="${ROOT}/frontend/certs/localhost-key.pem"
  CRT="${ROOT}/frontend/certs/localhost-cert.pem"
  if [[ -f "$KEY" && -f "$CRT" ]]; then
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "==> 未安装 openssl，跳过 https 证书生成（前端将使用 http）"
    return 0
  fi
  mkdir -p "${ROOT}/frontend/certs"
  SAN="DNS:localhost,IP:127.0.0.1"
  if [[ -n "${LAN_IP}" ]]; then
    SAN="${SAN},IP:${LAN_IP}"
  fi
  echo "==> 未找到本地开发证书，正在生成自签密钥与证书（${SAN}）..."
  set +e
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY" -out "$CRT" \
    -subj "/CN=localhost/O=SsPlatform-dev/C=CN" \
    -addext "subjectAltName=${SAN}" 2>/dev/null
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]] || [[ ! -f "$KEY" ]] || [[ ! -f "$CRT" ]]; then
    echo "==> 警告: openssl 生成证书失败，前端将使用 http。可手动执行: cd frontend && npm run gen-cert"
    rm -f "$KEY" "$CRT" 2>/dev/null || true
    return 0
  fi
  chmod 600 "$KEY" 2>/dev/null || true
  chmod 644 "$CRT" 2>/dev/null || true
  echo "==> 已生成: ${KEY} 与 ${CRT}"
}

# ── 检查并安装后端依赖 ────────────────────────────────────────────────────────
ensure_python_deps() {
  echo "==> 检查 Python 依赖..."
  # 用 pip show 批量检测：把 requirements.txt 里的包名全部提取出来一次性查询
  local pkgs=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    local pkg
    pkg="$(echo "$line" | sed 's/\[.*\]//' | sed 's/[>=<!;].*//' | tr -d ' ')"
    [[ -n "$pkg" ]] && pkgs+=("$pkg")
  done < "${ROOT}/requirements.txt"

  if [[ "${#pkgs[@]}" -eq 0 ]]; then
    echo "==> requirements.txt 为空，跳过"
    return 0
  fi

  local missing_count
  missing_count="$(pip3 show "${pkgs[@]}" 2>&1 | grep -c "WARNING: Package(s) not found" || true)"

  if [[ "$missing_count" -gt 0 ]]; then
    echo "==> 检测到缺少 Python 依赖，正在安装 requirements.txt..."
    pip3 install -r "${ROOT}/requirements.txt"
    echo "==> Python 依赖安装完成"
  else
    echo "==> Python 依赖已满足，跳过安装"
  fi
}

# ── 检查并安装前端依赖 ────────────────────────────────────────────────────────
ensure_node_deps() {
  echo "==> 检查前端依赖..."
  local node_modules="${ROOT}/frontend/node_modules"
  local pkg_json="${ROOT}/frontend/package.json"
  local needs_install=0

  if [[ ! -d "$node_modules" ]]; then
    needs_install=1
  else
    # 比较 package.json 与 node_modules/.package-lock.json / package-lock.json 的修改时间
    local lockfile="${ROOT}/frontend/package-lock.json"
    if [[ -f "$lockfile" ]] && [[ "$pkg_json" -nt "$lockfile" ]]; then
      needs_install=1
    elif [[ ! -f "$lockfile" ]]; then
      needs_install=1
    fi
  fi

  if [[ "$needs_install" -eq 1 ]]; then
    echo "==> 检测到前端依赖未安装或 package.json 有更新，正在执行 npm install..."
    cd "${ROOT}/frontend"
    npm install
    cd "${ROOT}"
    echo "==> 前端依赖安装完成"
  else
    echo "==> 前端依赖已满足，跳过安装"
  fi
}

ensure_python_deps
ensure_node_deps
ensure_dev_https_certs

FRONT_SCHEME="http"
if [[ -f "${ROOT}/frontend/certs/localhost-key.pem" ]] && [[ -f "${ROOT}/frontend/certs/localhost-cert.pem" ]]; then
  FRONT_SCHEME="https"
fi

cleanup() {
  if [[ -n "${BACK_PID:-}" ]] && kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONT_PID:-}" ]] && kill -0 "$FRONT_PID" 2>/dev/null; then
    kill "$FRONT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "==> 重启前清理: pkill -9 python"
pkill -9 python 2>/dev/null || true

echo "==> 后端: http://0.0.0.0:${BACK_PORT}  (目录: ${ROOT}/backend)"
cd "${ROOT}/backend"
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port "${BACK_PORT}" &
BACK_PID=$!

echo "==> 前端: ${FRONT_SCHEME}://localhost:${FRONT_PORT}  (目录: ${ROOT}/frontend；检测到 certs 时 Vite 自动 https)"
cd "${ROOT}/frontend"
npm run dev -- --port "${FRONT_PORT}" --host 0.0.0.0 &
FRONT_PID=$!

echo ""
echo "------------------------------------------------------------------"
echo "  登录页（本机）  ${FRONT_SCHEME}://127.0.0.1:${FRONT_PORT}/login"
echo "  登录页（本机）  ${FRONT_SCHEME}://localhost:${FRONT_PORT}/login"
if [[ -n "${LAN_IP}" ]]; then
  echo "  登录页（局域网） ${FRONT_SCHEME}://${LAN_IP}:${FRONT_PORT}/login"
  if [[ "${FRONT_SCHEME}" == "https" ]]; then
    echo "  （https 自签：手机浏览器需先信任/继续访问；若 API 不通请配置 VITE_API_BASE 指向本机 https 或可达的后端地址）"
  fi
else
  echo "  登录页（局域网） 未能自动解析本机 IP，请自行替换为当前机器局域网地址"
fi
echo "------------------------------------------------------------------"
echo "==> 已启动。按 Ctrl+C 结束前后端。"
wait
