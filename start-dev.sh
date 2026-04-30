#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_PORT="${BACK_PORT:-8077}"
FRONT_PORT="${FRONT_PORT:-5173}"
NODE_REQUIRED=22

# 获取局域网 IP
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

# 检查并安装/升级 Node.js
ensure_node_version() {
  local cur=0
  command -v node &>/dev/null && cur="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [[ "$cur" -ge "$NODE_REQUIRED" ]] && { echo "==> Node.js $(node -v) 已满足要求，跳过"; return; }

  echo "==> Node.js ${cur:+v$cur 版本过低，}准备安装 v${NODE_REQUIRED}..."

  # 加载或安装 nvm
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  for d in "$NVM_DIR" /usr/local/nvm /opt/nvm; do
    [[ -s "$d/nvm.sh" ]] && { source "$d/nvm.sh"; break; }
  done
  command -v nvm &>/dev/null || {
    echo "==> 安装 nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
  }

  if command -v nvm &>/dev/null; then
    nvm install "$NODE_REQUIRED" && nvm use "$NODE_REQUIRED" && nvm alias default "$NODE_REQUIRED"
    echo "==> Node.js $(node -v) 安装完成"
    echo "==> 清理旧 node_modules（Node 版本变更，需重装原生绑定）..."
    rm -rf "${ROOT}/frontend/node_modules" "${ROOT}/frontend/package-lock.json"
    return
  fi

  # 回退：系统包管理器
  echo "==> nvm 不可用，使用系统包管理器..."
  if [[ "$(uname -s)" == "Darwin" ]]; then
    command -v brew &>/dev/null || { echo "==> 错误：请手动安装 Node.js v${NODE_REQUIRED}+"; exit 1; }
    brew install "node@${NODE_REQUIRED}" && brew link --overwrite --force "node@${NODE_REQUIRED}"
  elif command -v apt-get &>/dev/null; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_REQUIRED}.x" | bash - && apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_REQUIRED}.x" | bash - && dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_REQUIRED}.x" | bash - && yum install -y nodejs
  else
    echo "==> 错误：无法自动安装 Node.js，请手动安装 v${NODE_REQUIRED}+"; exit 1
  fi
  echo "==> Node.js $(node -v) 安装完成"
  echo "==> 清理旧 node_modules（Node 版本变更，需重装原生绑定）..."
  rm -rf "${ROOT}/frontend/node_modules" "${ROOT}/frontend/package-lock.json"
}

# 检查并安装 Python 依赖
ensure_python_deps() {
  echo "==> 检查 Python 依赖..."
  local pkgs=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    local pkg; pkg="$(echo "$line" | sed 's/\[.*\]//;s/[>=<!;].*//' | tr -d ' ')"
    [[ -n "$pkg" ]] && pkgs+=("$pkg")
  done < "${ROOT}/requirements.txt"
  [[ "${#pkgs[@]}" -eq 0 ]] && { echo "==> requirements.txt 为空，跳过"; return; }

  local missing; missing="$(pip3 show "${pkgs[@]}" 2>&1 | grep -c "not found" || true)"
  if [[ "$missing" -gt 0 ]]; then
    echo "==> 安装缺失的 Python 依赖..."
    pip3 install -r "${ROOT}/requirements.txt"
  else
    echo "==> Python 依赖已满足，跳过"
  fi
}

# 检查并安装前端依赖
ensure_node_deps() {
  echo "==> 检查前端依赖..."
  local nm="${ROOT}/frontend/node_modules"
  local lock="${ROOT}/frontend/package-lock.json"
  local pkg="${ROOT}/frontend/package.json"
  local node_ver_file="${ROOT}/frontend/node_modules/.node_version"
  local cur_node_ver; cur_node_ver="$(node -v 2>/dev/null || echo unknown)"

  # node_modules 存在但 Node 版本变了，需要重装（避免原生绑定不匹配）
  if [[ -d "$nm" && -f "$node_ver_file" ]]; then
    local installed_ver; installed_ver="$(cat "$node_ver_file")"
    if [[ "$installed_ver" != "$cur_node_ver" ]]; then
      echo "==> Node.js 版本变更（${installed_ver} -> ${cur_node_ver}），清理 node_modules 重装..."
      rm -rf "$nm" "$lock"
    fi
  fi

  if [[ ! -d "$nm" || ! -f "$lock" || "$pkg" -nt "$lock" ]]; then
    echo "==> 执行 npm install（使用淘宝镜像）..."
    cd "${ROOT}/frontend" && npm install --registry=https://registry.npmmirror.com && cd "${ROOT}"
    echo "$cur_node_ver" > "$node_ver_file"
  else
    echo "==> 前端依赖已满足，跳过"
  fi
}

# 生成 HTTPS 自签证书
ensure_https_certs() {
  local KEY="${ROOT}/frontend/certs/localhost-key.pem"
  local CRT="${ROOT}/frontend/certs/localhost-cert.pem"
  [[ -f "$KEY" && -f "$CRT" ]] && return
  command -v openssl &>/dev/null || { echo "==> 无 openssl，前端使用 http"; return; }

  local SAN="DNS:localhost,IP:127.0.0.1"
  [[ -n "${LAN_IP}" ]] && SAN="${SAN},IP:${LAN_IP}"
  mkdir -p "${ROOT}/frontend/certs"
  echo "==> 生成自签证书（${SAN}）..."
  set +e
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY" -out "$CRT" \
    -subj "/CN=localhost/O=SsPlatform-dev/C=CN" \
    -addext "subjectAltName=${SAN}" 2>/dev/null
  local rc=$?; set -e
  if [[ "$rc" -ne 0 || ! -f "$KEY" ]]; then
    echo "==> 证书生成失败，前端使用 http"; rm -f "$KEY" "$CRT" 2>/dev/null || true; return
  fi
  chmod 600 "$KEY"; chmod 644 "$CRT"
  echo "==> 证书已生成"
}

# ── 环境准备 ──────────────────────────────────────────────────────────────────
ensure_node_version
ensure_python_deps
ensure_node_deps
ensure_https_certs

SCHEME="http"
[[ -f "${ROOT}/frontend/certs/localhost-key.pem" ]] && SCHEME="https"

# ── 启动 ──────────────────────────────────────────────────────────────────────
cleanup() {
  kill "${BACK_PID:-}" "${FRONT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pkill -9 python 2>/dev/null || true

cd "${ROOT}/backend"
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port "${BACK_PORT}" &
BACK_PID=$!

cd "${ROOT}/frontend"
npm run dev -- --port "${FRONT_PORT}" --host 0.0.0.0 &
FRONT_PID=$!

echo ""
echo "======================================================"
echo "  API 文档   http://127.0.0.1:${BACK_PORT}/docs"
echo "  前端       ${SCHEME}://localhost:${FRONT_PORT}/login"
[[ -n "${LAN_IP}" ]] && echo "  局域网     ${SCHEME}://${LAN_IP}:${FRONT_PORT}/login"
echo "======================================================"
echo "  Ctrl+C 停止服务"
echo ""
wait
