import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/require-auth";
import { AiError, DEFAULT_MODEL, chatJson, clearAiKey, getAiConfig, keyHint, saveAiConfig } from "../lib/ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TIERS = ["starter", "business", "enterprise"] as const;
type Tier = (typeof TIERS)[number];

const fail = (res: import("express").Response, err: unknown) => {
  if (err instanceof AiError) { res.status(err.status).json({ error: err.message }); return; }
  logger.error({ err }, "AI request failed");
  res.status(502).json({ error: (err as Error).message || "AI request failed" });
};

/** Whether AI is set up (any signed-in user: the editors show or hide the AI buttons). */
router.get("/ai/settings", async (_req, res): Promise<void> => {
  const cfg = await getAiConfig();
  res.json({ configured: !!cfg.apiKey, source: cfg.source, model: cfg.model, defaultModel: DEFAULT_MODEL, keyHint: keyHint(cfg.apiKey) });
});

router.put("/ai/settings", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, model } = (req.body ?? {}) as { apiKey?: unknown; model?: unknown };
  if (apiKey !== undefined && (typeof apiKey !== "string" || (apiKey.trim() && !/^sk-[\w-]{10,}$/.test(apiKey.trim())))) {
    res.status(400).json({ error: "That does not look like an OpenAI API key (it starts with sk-)." });
    return;
  }
  if (model !== undefined && (typeof model !== "string" || model.length > 80)) {
    res.status(400).json({ error: "Invalid model name" });
    return;
  }
  await saveAiConfig({ apiKey: apiKey as string | undefined, model: model as string | undefined });
  const cfg = await getAiConfig();
  res.json({ configured: !!cfg.apiKey, source: cfg.source, model: cfg.model, defaultModel: DEFAULT_MODEL, keyHint: keyHint(cfg.apiKey) });
});

router.delete("/ai/settings/key", requireAdmin, async (_req, res): Promise<void> => {
  await clearAiKey();
  const cfg = await getAiConfig();
  res.json({ configured: !!cfg.apiKey, source: cfg.source, model: cfg.model, defaultModel: DEFAULT_MODEL, keyHint: keyHint(cfg.apiKey) });
});

/** Check a key (the one typed, or the saved one) with a tiny request. */
router.post("/ai/test", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, model } = (req.body ?? {}) as { apiKey?: string; model?: string };
  try {
    const cfg = await getAiConfig();
    const out = await chatJson<{ ok?: boolean }>(cfg, "Answer with JSON only.", 'Reply with {"ok": true}.', { apiKey: apiKey?.trim() || undefined, model: model?.trim() || undefined });
    res.json({ ok: out.ok === true || Object.keys(out).length > 0, model: model?.trim() || cfg.model });
  } catch (err) {
    fail(res, err);
  }
});

type SplitItem = { title?: unknown; section?: unknown; detail?: unknown };
type SplitAnswer = { projectTitle?: unknown; packages?: Partial<Record<Tier, SplitItem[]>> };

const SYSTEM = `You are a senior solutions architect at Fratelanza, an Egyptian software company.
You split a client's system specification into three cumulative packages for a sales quotation:
- "starter": the core the client needs to start operating (essential modules and basic features).
- "business": what it ADDS on top of starter — extended operations, more workflows, reports, permissions, integrations.
- "enterprise": what it ADDS on top of business — advanced features: analytics/dashboards, AI/automation, multi-branch, mobile apps, advanced integrations, high scale.
Rules:
1. Use ONLY deliverables that appear in the client's document. Keep the client's own concrete wording, numbers, screens, reports and rules — never generic marketing phrases.
2. Every deliverable in the document appears in exactly one package. Do not repeat items across packages.
3. Each item is one concrete feature/module of the system ("title", at most 12 words), the module or section it belongs to ("section"), and a short "detail" sentence listing its specific specs from the document (fields, rules, reports, limits).
4. Leave out non-deliverables: introduction, objectives, background, timeline/phases, payments, acceptance criteria, client responsibilities, assumptions, signatures, notes.
5. Balance the packages: starter usually has 30–45% of the items, business 30–40%, enterprise the rest; every package has at least 2 items when there are 6 or more deliverables.
6. Write everything in the requested language.
Answer with JSON only: {"projectTitle": string, "packages": {"starter": [{"title","section","detail"}], "business": [...], "enterprise": [...]}}`;

/**
 * Split a technical proposal's specification / requirements into the three
 * packages with AI. Returns the items as the editor stores them (tierItems).
 */
router.post("/ai/split-packages", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as { language?: string; serviceName?: string; projectTitle?: string; text?: string; requirements?: string[]; customer?: string };
  const lang = b.language === "en" ? "English" : "Arabic (Egyptian business Arabic, formal)";
  const reqs = Array.isArray(b.requirements) ? b.requirements.filter((x) => typeof x === "string" && x.trim()).slice(0, 300) : [];
  const text = (typeof b.text === "string" ? b.text : "").slice(0, 60_000);
  if (!text.trim() && !reqs.length) {
    res.status(400).json({ error: "Nothing to split: the technical proposal has no specification or requirements." });
    return;
  }
  const user = [
    `Language of the answer: ${lang}`,
    b.serviceName ? `Service: ${b.serviceName}` : "",
    b.projectTitle ? `Project: ${b.projectTitle}` : "",
    b.customer ? `Client: ${b.customer}` : "",
    text.trim() ? `Client's specification document:\n"""\n${text}\n"""` : "",
    reqs.length ? `Client's requirements (one per line):\n${reqs.map((r) => `- ${r}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const cfg = await getAiConfig();
    const out = await chatJson<SplitAnswer>(cfg, SYSTEM, user);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const seen = new Set<string>();
    const items = TIERS.flatMap((tier) => (Array.isArray(out.packages?.[tier]) ? out.packages![tier]! : [])
      .map((x) => ({ text: str(x.title), section: str(x.section), detail: str(x.detail), tier }))
      .filter((x) => x.text && !seen.has(x.text) && seen.add(x.text)));
    if (!items.length) throw new AiError("The AI did not return any package items. Try again.");
    res.json({ projectTitle: str(out.projectTitle), items });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
