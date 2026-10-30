import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SpecItem } from "@/lib/spec-document";

export type AiStatus = { configured: boolean; source: "settings" | "env" | "none"; model: string; defaultModel: string; keyHint: string };

const base = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`${base()}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? `Error ${r.status}`);
  return json;
}

const KEY = ["ai-settings"];

/** Whether an OpenAI key is set up (the AI buttons depend on it). */
export function useAiStatus() {
  return useQuery({ queryKey: KEY, queryFn: () => call<AiStatus>("/ai/settings"), staleTime: 60_000 });
}

export function useAiSettingsActions() {
  const qc = useQueryClient();
  const done = (s: AiStatus) => { qc.setQueryData(KEY, s); return s; };
  return {
    save: (patch: { apiKey?: string; model?: string }) => call<AiStatus>("/ai/settings", "PUT", patch).then(done),
    removeKey: () => call<AiStatus>("/ai/settings/key", "DELETE").then(done),
    test: (patch: { apiKey?: string; model?: string }) => call<{ ok: boolean; model: string }>("/ai/test", "POST", patch),
  };
}

export type AiSplitRequest = {
  language: "ar" | "en";
  serviceName?: string;
  projectTitle?: string;
  customer?: string;
  /** Specification document (markdown) */
  text?: string;
  /** Requirements, one per entry */
  requirements?: string[];
};

/** Split a specification / requirement list into the three packages with AI. */
export function aiSplitPackages(req: AiSplitRequest) {
  return call<{ projectTitle: string; items: SpecItem[] }>("/ai/split-packages", "POST", req);
}
