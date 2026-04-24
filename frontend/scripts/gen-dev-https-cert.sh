#!/usr/bin/env bash
# 生成本地开发用自签名 TLS 证书（私钥 + 证书），供 Vite https 使用。
# 项目根目录执行 ./start-dev.sh 时，若 certs 下尚无密钥，会自动执行等价的 openssl 生成逻辑。
# 需要单独更新证书（例如局域网 IP 变更）时，可再运行本脚本或: cd frontend && npm run gen-cert
# 浏览器会提示「不安全」属正常，点「继续访问」即可；摄像头等 API 需在安全上下文中。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$(cd "${SCRIPT_DIR}/../certs" && pwd)"
mkdir -p "${CERT_DIR}"

KEY="${CERT_DIR}/localhost-key.pem"
CRT="${CERT_DIR}/localhost-cert.pem"

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
  if [[ -n "${ip}" ]] && [[ "${ip}" != "127.0.0.1" ]]; then
    echo "${ip}"
  fi
}

LAN_IP="$(detect_lan_ip || true)"
SAN="DNS:localhost,IP:127.0.0.1"
if [[ -n "${LAN_IP}" ]]; then
  SAN="${SAN},IP:${LAN_IP}"
fi

echo "==> 证书目录: ${CERT_DIR}"
echo "==> subjectAltName: ${SAN}"

openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout "${KEY}" -out "${CRT}" \
  -subj "/CN=localhost/O=SsPlatform-dev/C=CN" \
  -addext "subjectAltName=${SAN}"

chmod 600 "${KEY}" 2>/dev/null || true
chmod 644 "${CRT}" 2>/dev/null || true

echo ""
echo "已生成:"
echo "  私钥  ${KEY}"
echo "  证书  ${CRT}"
echo ""
echo "启动前端 (Vite 若发现上述文件会自动启用 https):"
echo "  cd frontend && npm run dev"
echo ""
echo "本机访问示例:"
echo "  https://localhost:5173/login"
echo "  https://127.0.0.1:5173/login"
if [[ -n "${LAN_IP}" ]]; then
  echo "  https://${LAN_IP}:5173/login   （手机需信任自签证书；API 代理仍指向本机 8000）"
fi
echo ""
echo "若局域网 IP 变更，请重新执行本脚本以更新证书中的 IP。"
