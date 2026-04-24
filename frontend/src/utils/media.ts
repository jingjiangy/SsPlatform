/** 将后端返回的相对路径拼到 API base（与 axios baseURL 一致），便于 `<video src>` 跨域/子路径部署时正确加载 */
export function resolveMediaUrl(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^(https?:|blob:)/i.test(s)) return s;
  const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  if (s.startsWith("/")) return base ? `${base}${s}` : s;
  return base ? `${base}/${s}` : s;
}
