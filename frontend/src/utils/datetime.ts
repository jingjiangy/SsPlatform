export function formatDateTime(value: unknown): string {
  if (value == null || value === "") return "—";
  const s = String(value).trim();
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 19);
}
