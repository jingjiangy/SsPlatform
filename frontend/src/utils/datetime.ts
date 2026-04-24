/**
 * 后端 API 已将 datetime 统一序列化为北京时间字符串 `YYYY-MM-DD HH:mm:ss`；
 * 此处只做展示整形，不再做时区换算。
 */
export function formatDateTime(value: unknown): string {
  if (value == null || value === "") return "—";
  const s = String(value).trim();
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 19);
}
