import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/require-auth";
import { AiError, DEFAULT_MODEL, chatJson, clearAiKey, getAiConfig, keyHint, saveAiConfig, type ContentPart } from "../lib/ai";
import multer from "multer";
import mammoth from "mammoth";
import { extractTextFromUpload } from "../lib/document-parser.js";
import { logger } from "../lib/logger";
import { jobbable, jobStatus } from "../lib/jobs";

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
router.post("/ai/split-packages", jobbable(async (req, res): Promise<void> => {
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
}));

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
router.post("/ai/contract-scope", jobbable(async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as { type?: string; projectName?: string; partyName?: string; packageName?: string; text?: string; delivery?: string; startDate?: string; annexProvided?: boolean; schedule?: string };
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
    b.delivery ? `Agreed delivery: ${b.delivery}${b.startDate ? `, work starting ${b.startDate}` : ""} — state this duration and delivery date in a clause` : "",
    b.schedule ? `Delivery schedule (what is received in each period):\n${b.schedule.slice(0, 8_000)}\n— write a clause tying acceptance${freelancer ? " and the freelancer's payments" : ""} to this schedule` : "",
    b.annexProvided ? "The technical annex is already written from the proposal with every requirement of the agreed package: return \"sections\": [] and write only the summary and the clauses." : "",
    `Technical proposal / specification:\n"""\n${text}\n"""`,
  ].filter(Boolean).join("\n\n");
  try {
    const cfg = await getAiConfig();
    type Answer = { summary?: unknown; sections?: { title?: unknown; items?: unknown }[]; clauses?: { title?: unknown; text?: unknown }[] };
    const out = await chatJson<Answer>(cfg, CONTRACT_SYSTEM, user);
    const str = (v: unknown) => (typeof v === "string" ? latinDigits(v.trim()) : "");
    const sections = (Array.isArray(out.sections) ? out.sections : [])
      .map((x) => ({ title: str(x?.title), items: (Array.isArray(x?.items) ? x.items : []).map(str).filter(Boolean) }))
      .filter((x) => x.items.length);
    const clauses = (Array.isArray(out.clauses) ? out.clauses : [])
      .map((x) => ({ title: str(x?.title), text: str(x?.text) }))
      .filter((x) => x.text);
    if (!sections.length && !clauses.length && !str(out.summary)) throw new AiError("The AI did not return any contract terms. Try again.");
    res.json({ summary: str(out.summary), sections, clauses });
  } catch (err) {
    fail(res, err);
  }
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const ANALYZE_SYSTEM = `You read a software company's technical proposal (any layout: tables, cards, timelines; Arabic or English) and extract its offer COMPLETELY and exactly.
Return JSON only:
{"projectTitle": string, "summary": string (1-2 sentences: what the system is),
 "startDate": string ("" if none),
 "packages": [{"number": number, "name": string,
   "statedCount": number (how many features / requirements the document says this package has in total, e.g. "١٩ ميزة ومتطلبًا" -> 19; 0 if not stated),
   "includesPrevious": boolean (the package contains everything in the one before),
   "itemsFromPhases": boolean (true when this package's requirement rows are listed under its delivery phases; then "items" may be []),
   "durations": [{"mode": "normal" | "compressed", "weeks": string (e.g. "8" or "8 – 10"), "delivery": string (delivery date as written, "" if none)}],
   "items": [{"title": string, "detail": string ("" if none),
     "normal": {"from": number, "to": number} | null, "compressed": {"from": number, "to": number} | null}]}],
 "phases": [{"number": number, "title": string, "summary": string ("" if none), "statedCount": number (rows the document says the phase has, 0 if not stated),
   "period": string (as written, "" if none), "fromWeek": number, "toWeek": number,
   "normal": {"weeks": string, "delivery": string} | null, "compressed": {"weeks": string, "delivery": string} | null,
   "payment": string (the payment due on this phase, e.g. "الدفعة 1", "" if none),
   "deliverables": [{"title": string, "detail": string, "normal": {"from": number, "to": number} | null, "compressed": {"from": number, "to": number} | null}],
   "packageNumber": number (0 = every package), "mode": "normal" | "compressed" | ""}],
 "notes": [string],
 "chosen": {"number": number, "reason": string} or null}
Rules:
- "items" lists EVERY requirement / feature row the package adds, one entry per table row, copied in full in the proposal's language (keep product names such as Claude, Cloudflare, OWASP, Zotero). Never summarise, merge, skip or invent rows. Count the rows: a package's items plus those of the packages it includes must match its statedCount.
- When a package "includes everything in the previous package", list only the rows it adds and set includesPrevious true.
- Per-row execution weeks such as "٠ ← ١" or "1.5 → 2" go into "normal" / "compressed" as numbers {"from": 0, "to": 1} (Arabic digits converted). Use null when a row has none.
- "phases": delivery phases / milestones the document defines with what is delivered or received in each (e.g. "first 4 weeks: X and Y", or "المرحلة ١ … بعد تسليم هذه المرحلة وقبولها تُستحق الدفعة ١"); [] if the document does not define them.
  When a phase has its own table of requirements, "deliverables" lists EVERY row of that table in full (same rules as items) and the package that is split into these phases gets "itemsFromPhases": true. Each phase keeps its own normal / compressed duration and delivery date and the payment tied to it.
- "notes": the document's conditions and assumptions that matter for a contract (e.g. how the compressed duration is decided, what each package includes), short sentences; [] if none.
- If the proposal has no packages, return one package named after the project holding all its deliverables.
- "chosen" only when the document itself states which package the client selected or approved; otherwise null.`;

type Range = { from: number; to: number } | null;
type RawItem = { title?: unknown; detail?: unknown; normal?: { from?: unknown; to?: unknown } | null; compressed?: { from?: unknown; to?: unknown } | null };
type RawPkg = { number?: unknown; name?: unknown; statedCount?: unknown; includesPrevious?: unknown; itemsFromPhases?: unknown; durations?: { mode?: unknown; weeks?: unknown; delivery?: unknown }[]; items?: RawItem[] };

/** Arabic-Indic digits as 0-9 like the rest of the documents (mixed digits turn dates around in RTL text) */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/٫/g, ".");
const str = (v: unknown) => (typeof v === "string" ? latinDigits(v.trim()) : typeof v === "number" ? String(v) : "");
const range = (r: RawItem["normal"]): Range => {
  const from = Number(r?.from), to = Number(r?.to);
  return r && Number.isFinite(from) && Number.isFinite(to) && to > 0 ? { from, to } : null;
};
const toItems = (list: unknown) => (Array.isArray(list) ? list as RawItem[] : [])
  .map((x) => ({ title: str(x?.title), detail: str(x?.detail), normal: range(x?.normal), compressed: range(x?.compressed) }))
  .filter((x) => x.title);

/**
 * Read a technical proposal file (PDF read by the model page by page; Word / text as text) into
 * its packages, every requirement with its weeks, the delivery phases and notes, so the user can
 * pick the client's package. A package that comes back with fewer rows than the document states
 * is asked for again, completely.
 */
router.post("/ai/analyze-proposal", upload.single("file"), jobbable(async (req, res): Promise<void> => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  const typed = typeof req.body?.text === "string" ? req.body.text : "";
  try {
    let text = typed;
    const fileParts: ContentPart[] = [];
    if (file) {
      if (/\.docx$/i.test(file.originalname)) {
        text = (await mammoth.extractRawText({ buffer: file.buffer })).value ?? "";
      } else {
        text = (await extractTextFromUpload(file.buffer, file.originalname)).text;
      }
      // The model reads the PDF itself (layout, tables, Arabic order); the extracted text goes along as a hint
      if (/\.pdf$/i.test(file.originalname)) {
        fileParts.push({ type: "file", file: { filename: file.originalname, file_data: `data:application/pdf;base64,${file.buffer.toString("base64")}` } });
      }
    }
    if (!text.trim() && !fileParts.length) {
      res.status(400).json({ error: "Nothing to read: upload the technical proposal file." });
      return;
    }
    const textPart: ContentPart = { type: "text", text: `${fileParts.length ? "Text extracted from the file (its Arabic word order may be broken; trust the file):\n" : "Technical proposal:\n"}"""\n${text.slice(0, 80_000)}\n"""` };
    const cfg = await getAiConfig();
    const opts = { timeoutMs: 240_000, maxTokens: 16_000 };
    const out = await chatJson<{ projectTitle?: unknown; summary?: unknown; startDate?: unknown; packages?: RawPkg[]; phases?: Record<string, unknown>[]; notes?: unknown[]; chosen?: { number?: unknown; reason?: unknown } | null }>(cfg, ANALYZE_SYSTEM, [...fileParts, textPart], opts);
    const dur = (v: unknown) => {
      const d = v as { weeks?: unknown; delivery?: unknown } | null;
      return d && (str(d.weeks) || str(d.delivery)) ? { weeks: str(d.weeks), delivery: str(d.delivery) } : null;
    };
    const phases = (Array.isArray(out.phases) ? out.phases : []).map((x, i) => ({
      number: Number(x.number) || i + 1,
      title: str(x.title), summary: str(x.summary), period: str(x.period),
      statedCount: Math.max(0, Math.round(Number(x.statedCount) || 0)),
      fromWeek: Number(x.fromWeek) || 0, toWeek: Number(x.toWeek) || 0,
      normal: dur(x.normal), compressed: dur(x.compressed), payment: str(x.payment),
      // Older answers gave deliverables as plain strings
      deliverables: (Array.isArray(x.deliverables) ? x.deliverables : []).map((d) => (typeof d === "string" ? { title: d.trim(), detail: "", normal: null, compressed: null } : toItems([d])[0]))
        .filter((d): d is NonNullable<typeof d> => !!d && !!d.title),
      packageNumber: Number(x.packageNumber) || 0,
      mode: x.mode === "compressed" || x.mode === "normal" ? x.mode : "",
    })).filter((x) => x.title || x.deliverables.length);
    const packages = (Array.isArray(out.packages) ? out.packages : []).map((p, i) => ({
      number: Number(p.number) || i + 1,
      name: str(p.name) || `باقة ${i + 1}`,
      statedCount: Math.max(0, Math.round(Number(p.statedCount) || 0)),
      includesPrevious: p.includesPrevious === true,
      durations: (Array.isArray(p.durations) ? p.durations : [])
        .map((d) => ({ mode: d.mode === "compressed" ? "compressed" as const : "normal" as const, weeks: str(d.weeks), delivery: str(d.delivery) }))
        .filter((d) => d.weeks || d.delivery),
      items: toItems(p.items),
      itemsFromPhases: p.itemsFromPhases === true,
    }));
    // A package delivered in phases: its requirements are the phases' rows
    for (const p of packages) {
      const own = phases.filter((x) => x.packageNumber === p.number || (!x.packageNumber && packages.length === 1));
      if ((p.itemsFromPhases || !p.items.length) && own.some((x) => x.deliverables.length)) {
        p.items = own.flatMap((x) => x.deliverables.map((d) => ({ ...d, detail: d.detail || x.title })));
      }
    }
    for (let i = packages.length - 1; i >= 0; i--) if (!packages[i]!.items.length) packages.splice(i, 1);
    if (!packages.length) throw new AiError("The AI could not find packages or requirements in this file.");

    // Completeness: rows this package adds = its stated total minus the stated total of the package it builds on
    const expectedOwn = (i: number) => {
      const p = packages[i]!;
      if (!p.statedCount) return 0;
      const prev = p.includesPrevious && i > 0 ? packages[i - 1]!.statedCount : 0;
      return Math.max(0, p.statedCount - prev);
    };
    await Promise.all(packages.map(async (p, i) => {
      const want = expectedOwn(i);
      // A package built from its phases is completed phase by phase below
      if (!want || p.items.length >= want || p.itemsFromPhases) return;
      const ask: ContentPart = { type: "text", text: `Package ${p.number} «${p.name}»${p.includesPrevious ? " (only the rows it adds to the previous package)" : ""} has ${want} requirement rows in the document, but only ${p.items.length} were listed:\n${p.items.map((x) => `- ${x.title}`).join("\n")}\n\nReturn ALL ${want} rows of this package, in the document's order, as {"items": [{"title", "detail", "normal", "compressed"}]} following the same rules.` };
      try {
        const more = await chatJson<{ items?: unknown }>(cfg, ANALYZE_SYSTEM, [...fileParts, textPart, ask], opts);
        const items = toItems(more.items);
        if (items.length > p.items.length) p.items = items;
      } catch (err) {
        logger.warn({ err, package: p.number }, "Completing a package's requirements failed");
      }
    }));

    // The same for phases that state how many requirements they have
    await Promise.all(phases.map(async (x) => {
      if (!x.statedCount || x.deliverables.length >= x.statedCount) return;
      const ask: ContentPart = { type: "text", text: `Phase ${x.number} «${x.title}» has ${x.statedCount} requirement rows in the document, but only ${x.deliverables.length} were listed:\n${x.deliverables.map((d) => `- ${d.title}`).join("\n")}\n\nReturn ALL ${x.statedCount} rows of this phase, in the document's order, as {"items": [{"title", "detail", "normal", "compressed"}]} following the same rules.` };
      try {
        const more = await chatJson<{ items?: unknown }>(cfg, ANALYZE_SYSTEM, [...fileParts, textPart, ask], opts);
        const items = toItems(more.items);
        if (items.length > x.deliverables.length) {
          x.deliverables = items;
          // Keep the package built from the phases in step
          for (const p of packages) {
            if (p.itemsFromPhases) p.items = phases.filter((y) => y.packageNumber === p.number || (!y.packageNumber && packages.length === 1)).flatMap((y) => y.deliverables.map((d) => ({ ...d, detail: d.detail || y.title })));
          }
        }
      } catch (err) {
        logger.warn({ err, phase: x.number }, "Completing a phase's requirements failed");
      }
    }));
    const chosenNo = Number(out.chosen?.number);
    res.json({
      projectTitle: str(out.projectTitle), summary: str(out.summary), startDate: str(out.startDate),
      packages: packages.map((p, i) => ({ ...p, expectedOwn: expectedOwn(i) })),
      phases, notes: (Array.isArray(out.notes) ? out.notes : []).map(str).filter(Boolean),
      chosen: packages.some((p) => p.number === chosenNo) ? { number: chosenNo, reason: str(out.chosen?.reason) } : null,
      text,
    });
  } catch (err) {
    fail(res, err);
  }
}));

/** Result of a long AI request started with ?async=1 */
router.get("/ai/jobs/:id", jobStatus);

export default router;
