import http from "@/api/http";

export async function translateZhToEnEval(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  try {
    const { data } = await http.get<{ text?: string }>("/api/evaluations/translate/zh-to-en", {
      params: { q: trimmed },
    });
    if (typeof data?.text === "string" && data.text.trim()) return data.text.trim();
  } catch {}
  return trimmed;
}
