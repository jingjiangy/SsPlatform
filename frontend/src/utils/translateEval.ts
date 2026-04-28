import http from "@/api/http";

/** 步骤名等短句中译英；无中文或失败时返回原文 */
export async function translateZhToEnEval(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  try {
    const { data } = await http.get<{ text?: string }>("/api/evaluations/translate/zh-to-en", {
      params: { q: trimmed },
    });
    if (typeof data?.text === "string" && data.text.trim()) {
      return data.text.trim();
    }
  } catch {
    /* fallback below */
  }
  return trimmed;
}
