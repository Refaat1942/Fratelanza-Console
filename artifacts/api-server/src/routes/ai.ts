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

const CONTRACT_SYSTEM = `You are a senior Egyptian contracts lawyer and software delivery manager at Fratelanza, a software company.
From a client's technical proposal / specification you write the project-specific parts of a contract, in formal Egyptian legal Arabic.
The contract already contains general clauses for: preamble, subject, duration, total price and payment schedule, change requests, free support,
confidentiality and IP, termination and penalties, jurisdiction, copies (client contract) — or project value, payment schedule, inspection and
acceptance, final delivery and source code, free maintenance, duration and change requests (freelancer contract). Do NOT repeat those.
Write:
1. "summary": one or two sentences describing the project and its scope as a contract would state it.
2. "sections": the technical annex — the deliverables grouped by module / section of the system. Each item is one concrete, verifiable
   deliverable taken from the document (screens, functions, reports, integrations, user roles, platforms), written as a contractual obligation
   ("توفير شاشة ... تتيح ..."). Keep the document's real specifics (numbers, names, rules). Leave out marketing text, objectives, timelines,
   prices and payment terms. 3–12 sections, 2–12 items each.
3. "clauses": 3–7 project-specific clauses that the general contract lacks and this project needs, e.g. acceptance criteria for the
   deliverables, the client's inputs and data the work depends on, third-party services / integrations and who pays for them, hosting and
   deployment, data migration, training and handover documents, what is explicitly out of scope. Each has a short "title" and a "text"
   paragraph. For a freelancer contract, write them as the freelancer's obligations towards Fratelanza (the first party) for this scope.
Write everything in Arabic. Answer with JSON only:
{"summary": string, "sections": [{"title": string, "items": [string]}], "clauses": [{"title": string, "text": string}]}`;

/**
 * Turn a technical proposal / specification into a contract's technical annex
 * and project-specific clauses (client or freelancer contract).
 */
router.post("/ai/contract-scope", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as { type?: string; projectName?: string; partyName?: string; packageName?: string; text?: string };
  const text = (typeof b.text === "string" ? b.text : "").slice(0, 60_000);
  if (!text.trim()) {
    res.status(400).json({ error: "Nothing to read: choose a technical proposal or upload a file first." });
    return;
  }
  const freelancer = b.type === "freelancer";
  const user = [
    `Contract: ${freelancer ? "freelancer (executor) contract — the second party is the freelancer who builds this scope for Fratelanza" : "client contract — the second party is the client"}`,
    b.projectName ? `Project: ${b.projectName}` : "",
    b.partyName ? `Second party: ${b.partyName}` : "",
    b.packageName ? `Agreed package: ${b.packageName} — include only what this package covers` : "",
    `Technical proposal / specification:\n"""\n${text}\n"""`,
  ].filter(Boolean).join("\n\n");
  try {
    const cfg = await getAiConfig();
    type Answer = { summary?: unknown; sections?: { title?: unknown; items?: unknown }[]; clauses?: { title?: unknown; text?: unknown }[] };
    const out = await chatJson<Answer>(cfg, CONTRACT_SYSTEM, user);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const sections = (Array.isArray(out.sections) ? out.sections : [])
      .map((x) => ({ title: str(x?.title), items: (Array.isArray(x?.items) ? x.items : []).map(str).filter(Boolean) }))
      .filter((x) => x.items.length);
    const clauses = (Array.isArray(out.clauses) ? out.clauses : [])
      .map((x) => ({ title: str(x?.title), text: str(x?.text) }))
      .filter((x) => x.text);
    if (!sections.length && !clauses.length) throw new AiError("The AI did not return any contract terms. Try again.");
    res.json({ summary: str(out.summary), sections, clauses });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
