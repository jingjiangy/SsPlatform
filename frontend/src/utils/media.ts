export function resolveMediaUrl(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("blob:")) return s;
  if (/^https?:/i.test(s)) {
    if (isLoopbackStaticUrl(s)) {
      try {
        const u = new URL(s);
        return withApiBase(u.pathname + u.search + u.hash);
      } catch { return s; }
    }
    return s;
  }
  return withApiBase(s);
}

function isLoopbackStaticUrl(s: string): boolean {
  try {
    const u = new URL(s, "http://localhost");
    if (!u.pathname.startsWith("/static/")) return false;
    const a = u.hostname.toLowerCase();
    return a === "localhost" || a === "127.0.0.1" || a === "::1" || a === "[::1]";
  } catch { return false; }
}

function withApiBase(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const p = path.trim();
  if (p.startsWith("/")) return base ? `${base}${p}` : p;
  return base ? `${base}/${p}` : p;
}
