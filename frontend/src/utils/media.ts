/**
 * 将后端返回的相对路径拼到 API base（与 axios baseURL 一致），便于 `<video src>` 在开发代理/生产反代时正确加载。
 * 若库里存的是 `http://127.0.0.1:端口/static/...` 等本机回环地址，在「手机 / 局域网 IP 访问本机 Vite」时
 * 会错误请求到当前设备回环，导致无法播放。此类 URL 会转为按当前站点的路径再拼 base（与 /api 同源）。
 */
export function resolveMediaUrl(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("blob:")) return s;
  if (/^https?:/i.test(s)) {
    if (isLoopbackStaticUrl(s)) {
      try {
        const u = new URL(s);
        return withApiBase(u.pathname + u.search + u.hash);
      } catch {
        return s;
      }
    }
    return s;
  }
  return withApiBase(s);
}

function isLoopbackStaticUrl(s: string): boolean {
  try {
    const u = new URL(s, "http://localhost");
    if (!u.pathname.startsWith("/static/")) return false;
    return isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(h: string): boolean {
  const a = h.toLowerCase();
  return a === "localhost" || a === "127.0.0.1" || a === "::1" || a === "[::1]";
}

function withApiBase(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const p = path.trim();
  if (p.startsWith("/")) {
    return base ? `${base}${p}` : p;
  }
  return base ? `${base}/${p}` : p;
}
