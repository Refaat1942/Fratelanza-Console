import { db, appSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/** Settings keys of the AI provider (OpenAI). */
const KEY = "openai_api_key";
const MODEL = "openai_model";
export const DEFAULT_MODEL = "gpt-4o-mini";

export type AiConfig = { apiKey: string; model: string; source: "settings" | "env" | "none" };

/** The OpenAI key saved in Settings, else the OPENAI_API_KEY environment variable. */
export async function getAiConfig(): Promise<AiConfig> {
  const rows = await db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, [KEY, MODEL]));
  const get = (k: string) => rows.find((r) => r.key === k)?.value.trim() ?? "";
  const saved = get(KEY);
  const env = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model = get(MODEL) || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (saved) return { apiKey: saved, model, source: "settings" };
  if (env) return { apiKey: env, model, source: "env" };
  return { apiKey: "", model, source: "none" };
}

async function put(key: string, value: string) {
  await db.insert(appSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
}

export async function saveAiConfig(patch: { apiKey?: string; model?: string }): Promise<void> {
  if (patch.apiKey !== undefined) await put(KEY, patch.apiKey.trim());
  if (patch.model !== undefined) await put(MODEL, patch.model.trim());
}

export async function clearAiKey(): Promise<void> {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, KEY));
}

/** "sk-…AbCd": enough to recognise the key without exposing it. */
export function keyHint(key: string): string {
  return key ? `${key.slice(0, 3)}…${key.slice(-4)}` : "";
}

export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/** One chat completion that must answer with a JSON object. */
export async function chatJson<T>(cfg: AiConfig, system: string, user: string, override?: { apiKey?: string; model?: string }): Promise<T> {
  const apiKey = override?.apiKey || cfg.apiKey;
  if (!apiKey) throw new AiError("AI is not set up: add an OpenAI API key in Settings.", 400);
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: override?.model || cfg.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({})) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
  if (!res.ok) {
    const msg = body.error?.message ?? `OpenAI error ${res.status}`;
    throw new AiError(res.status === 401 ? "The OpenAI API key was rejected (401). Check it in Settings." : msg, res.status === 401 ? 400 : 502);
  }
  const content = body.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AiError("The AI answer could not be read. Try again.");
  }
}
