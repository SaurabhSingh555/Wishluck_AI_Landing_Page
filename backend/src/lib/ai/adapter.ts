import { z } from "zod";

export interface AiConfig {
  provider: "gemini" | "openai" | "none";
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
}

export function aiConfig(): AiConfig {
  const provider = (process.env.AI_PROVIDER ?? "none").toLowerCase() as AiConfig["provider"];
  const key = process.env.AI_API_KEY;
  if (provider === "gemini") {
    return { provider: key ? "gemini" : "none", model: process.env.AI_MODEL ?? "gemini-2.0-flash", baseUrl: process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta", apiKey: key };
  }
  if (provider === "openai") {
    return { provider: key ? "openai" : "none", model: process.env.AI_MODEL ?? "gpt-4o-mini", baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1", apiKey: key };
  }
  return { provider: "none", model: "", baseUrl: "", apiKey: undefined };
}

export function aiAvailable() {
  return aiConfig().provider !== "none";
}

/** Calls the configured LLM and returns schema-validated JSON. Retries once on invalid JSON. */
export async function generateJson<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  const cfg = aiConfig();
  if (cfg.provider === "none") throw new Error("AI provider not configured (set AI_PROVIDER and AI_API_KEY).");
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt ? `${user}\n\nYour previous reply was invalid: ${lastErr}. Return ONLY valid JSON matching the schema.` : user;
    const text = cfg.provider === "gemini" ? await callGemini(cfg, system, prompt) : await callOpenAi(cfg, system, prompt);
    try {
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
      return schema.parse(parsed);
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 300);
    }
  }
  throw new Error(`AI returned invalid structured output: ${lastErr}`);
}

async function callOpenAi(cfg: AiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return json.choices?.[0]?.message?.content ?? "";
}

async function callGemini(cfg: AiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models/${cfg.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}
