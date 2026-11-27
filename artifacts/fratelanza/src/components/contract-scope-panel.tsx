import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListProposals, type Proposal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/search-select";
import { useToast } from "@/hooks/use-toast";
import { useAiStatus, aiRequest } from "@/lib/ai-client";
import { normalizeProposal, packageContents, hasSpecTiers, type ProposalData } from "@/lib/proposal-document";
import { TIERS, TIER_NAME } from "@/lib/service-catalog";
import { htmlToMarkdown, specItems } from "@/lib/spec-document";
import { extractOutlineFromFile } from "@/lib/outline-file-parser";
import type { ContractScope } from "@/lib/contract-document";
import { FileText, Upload, Sparkles, Wand2, Loader2, Plus, X, Trash2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

const apiBase = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type Duration = { mode: "normal" | "compressed"; weeks: string; delivery: string };
type WeekRange = { from: number; to: number } | null;
type Item = { title: string; detail: string; normal?: WeekRange; compressed?: WeekRange };
type Pkg = { number: number; name: string; includesPrevious: boolean; durations: Duration[]; items: Item[]; statedCount?: number; expectedOwn?: number };
type PhaseDuration = { weeks: string; delivery: string } | null;
/** A delivery phase of the proposal: what is delivered (every requirement), when, and the payment tied to it */
type Phase = {
  number?: number; title: string; summary?: string; period: string; fromWeek: number; toWeek: number; statedCount?: number;
  normal?: PhaseDuration; compressed?: PhaseDuration; payment?: string;
  deliverables: Item[]; packageNumber: number; mode: "normal" | "compressed" | "";
};
/** A technical proposal read into its packages (by AI from a file, or from a proposal saved here). */
type Analysis = {
  source: string;
  projectTitle: string;
  summary: string;
  startDate: string;
  packages: Pkg[];
  chosen: { number: number; reason: string } | null;
  /** The proposal as text, for drafting the clauses */
  text: string;
  /** Milestones the document defines (what is received when) */
  phases?: Phase[];
  notes?: string[];
};

export type Plan = { label: string; items: string[] }[];
const PERIOD = (a: number, b: number) => (a === b ? `الأسبوع ${a}` : `الأسابيع ${a} – ${b}`);

/** The proposal's phases that apply to the chosen package(s) and delivery mode. */
function phasesOf(a: Analysis, included: Pkg[], mode: Duration["mode"] | ""): Phase[] {
  const pkgNos = new Set(included.map((p) => p.number));
  const ofPackage = (a.phases ?? []).filter((x) => !x.packageNumber || pkgNos.has(x.packageNumber));
  // A phase with its own normal and compressed dates applies to both modes; only phases written for one mode are filtered
  const forMode = ofPackage.filter((x) => !mode || !x.mode || x.mode === mode || !!(x.normal && x.compressed));
  return forMode.length ? forMode : ofPackage;
}

/** Arabic-Indic digits (٠-٩ / ۰-۹) as 0-9, like the rest of the contract (mixed digits turn dates around in RTL) */
function latinDigits<T>(v: T): T {
  return JSON.parse(JSON.stringify(v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/٫/g, ".")) as T;
}

/** "المرحلة 1: الأساس والتجربة والأمان — حتى الأسبوع 8 (28 يناير 2027)" */
function phaseLabel(x: Phase, mode: Duration["mode"] | ""): string {
  const d = (mode === "compressed" ? x.compressed : x.normal) ?? x.normal ?? x.compressed;
  const when = d?.weeks ? `حتى الأسبوع ${d.weeks}${d.delivery ? ` (${d.delivery})` : ""}` : x.period || (x.toWeek ? PERIOD(x.fromWeek || 1, x.toWeek) : "");
  const name = x.number && !/المرحلة|phase/i.test(x.title) ? `المرحلة ${x.number}: ${x.title}` : x.title;
  return [name, when].filter(Boolean).join(" — ");
}

/**
 * What is delivered / received when, for the chosen package and delivery mode:
 * the document's own phases if it defines them, else its requirements grouped by the week they finish in.
 */
function deliveryPlan(a: Analysis, included: Pkg[], mode: Duration["mode"] | "", every: number | "phases"): Plan {
  const phases = phasesOf(a, included, mode);
  if (every === "phases" && phases.length) {
    return phases.map((x) => ({ label: phaseLabel(x, mode), items: x.deliverables.map((d) => d.title) }));
  }
  const m = mode || "normal";
  const dated = included.flatMap((p) => p.items).map((x) => ({ title: x.title, end: (m === "compressed" ? x.compressed : x.normal) ?? x.normal ?? x.compressed }))
    .filter((x) => x.end && x.end.to > 0) as { title: string; end: { from: number; to: number } }[];
  if (!dated.length) return [];
  const step = typeof every === "number" ? every : 4;
  const groups = new Map<number, string[]>();
  for (const x of dated) {
    const k = Math.max(1, Math.ceil(x.end.to / step));
    groups.set(k, [...(groups.get(k) ?? []), x.title]);
  }
  return [...groups].sort((x, y) => x[0] - y[0]).map(([k, items]) => ({ label: PERIOD((k - 1) * step + 1, k * step), items }));
}

/** A proposal saved in the system: its packages are already known. */
function analysisFromSaved(label: string, d: ProposalData): Analysis {
  const text = [d.projectTitle, d.customer.needs, d.requirementsText || d.requirements.map((r) => `- ${r.text}`).join("\n")].filter((x) => x?.trim()).join("\n\n");
  let packages: Pkg[] = [];
  if (hasSpecTiers(d) || !d.requirementsText.trim()) {
    packages = TIERS.map((t, i) => ({
      number: i + 1, name: TIER_NAME[t], includesPrevious: i > 0, durations: [],
      items: packageContents(d, t).map((x) => ({ title: x.title, detail: x.detail })),
    })).filter((p) => p.items.length);
  }
  if (!packages.length) {
    const items = specItems(d.requirementsText).map((x) => ({ title: x.text, detail: x.section !== x.text ? x.section : "" }));
    const reqs = d.requirements.map((r) => ({ title: r.text, detail: r.group ?? "" }));
    packages = [{ number: 1, name: d.projectTitle || label, includesPrevious: false, durations: [], items: items.length ? items : reqs }].filter((p) => p.items.length);
  }
  const chosenIdx = d.tier ? TIERS.indexOf(d.tier) : -1;
  const chosen = chosenIdx >= 0 && packages.some((p) => p.number === chosenIdx + 1) ? { number: chosenIdx + 1, reason: "" } : null;
  return { source: label, projectTitle: d.projectTitle ?? "", summary: d.customer.needs, startDate: "", packages, chosen, text };
}

/** Without AI: one package holding the document's deliverables. */
function analysisFromText(source: string, text: string): Analysis {
  const items = specItems(text).map((x) => ({ title: x.text, detail: x.section !== x.text ? x.section : "" }));
  const lines = items.length ? items : text.split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter((l) => l.length > 3).slice(0, 150).map((title) => ({ title, detail: "" }));
  return { source, projectTitle: "", summary: "", startDate: "", packages: [{ number: 1, name: source, includesPrevious: false, durations: [], items: lines }], chosen: null, text };
}

/** The chosen package with the ones it builds on (when it "includes everything before it"). */
function packagesUpTo(a: Analysis, number: number): Pkg[] {
  const chosen = a.packages.find((p) => p.number === number);
  if (!chosen) return [];
  const out: Pkg[] = [chosen];
  let cur = chosen;
  while (cur.includesPrevious) {
    const prev = [...a.packages].filter((p) => p.number < cur.number).sort((x, y) => y.number - x.number)[0];
    if (!prev) break;
    out.unshift(prev);
    cur = prev;
  }
  return out;
}

const modeLabel = (m: Duration["mode"]) => (m === "compressed" ? "إنجاز مضغوط" : "إنجاز عادي");

type Props = {
  type: "client" | "freelancer";
  value?: ContractScope;
  onChange: (v: ContractScope | undefined) => void;
  projectName: string;
  partyName: string;
  /** Client whose technical proposals are listed first */
  clientName?: string;
  /** Turn the delivery plan into the contract's payment schedule */
  onFillStages?: (plan: Plan, opts?: { keepPcts?: boolean }) => void;
  /** The agreed duration in weeks (client contract: fills its execution period when empty) */
  onDuration?: (weeks: number) => void;
};

/** Contract editor: read a technical proposal, pick the client's package, merge every requirement and the project clauses into the contract. */
export function ContractScopePanel({ type, value, onChange, projectName, partyName, clientName, onFillStages, onDuration }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: aiStatus } = useAiStatus();
  const { data: proposals = [] } = useListProposals();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pkgNo, setPkgNo] = useState(0);
  const [mode, setMode] = useState<Duration["mode"] | "">("");
  const [showItems, setShowItems] = useState(false);
  const [every, setEvery] = useState<number | "phases">("phases");
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "file" | "ai">("");

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const technical = useMemo(() => (proposals as Proposal[])
    .filter((p) => (p.data as Partial<ProposalData> | undefined)?.kind !== "quote")
    .map((p) => {
      const d = normalizeProposal(p.data as unknown as ProposalData);
      return { p, d, label: `${p.clientName}${d.projectTitle ? ` — ${d.projectTitle}` : ""}`, mine: !!clientName && norm(p.clientName) === norm(clientName) };
    }), [proposals, clientName]);

  const applyAnalysis = (raw: Analysis) => {
    const a = latinDigits(raw);
    setAnalysis(a);
    const first = a.chosen?.number ?? (a.packages.length === 1 ? a.packages[0]!.number : 0);
    setPkgNo(first);
    setMode(a.packages.find((p) => p.number === first)?.durations[0]?.mode ?? "");
    setShowItems(false);
    setEvery(a.phases?.length ? "phases" : 4);
  };
  const pickProposal = (v: string) => {
    setPick(v);
    const x = technical.find((y) => String(y.p.id) === v);
    if (x) applyAnalysis(analysisFromSaved(x.label, x.d));
  };

  const upload = async (f: File) => {
    setLastFile(f);
    setBusy("file");
    setPick("");
    try {
      if (aiStatus?.configured) {
        // AI reads the file (a PDF page by page) into its packages, durations and requirements
        const fd = new FormData();
        fd.append("file", f);
        const body = await aiRequest<Omit<Analysis, "source">>("/ai/analyze-proposal", fd);
        applyAnalysis({ ...body, source: f.name });
        toast({ title: t("contractScope.analyzed", { count: body.packages.length }) });
      } else {
        let text = "";
        if (/\.(docx|pdf|xlsx?|txt)$/i.test(f.name)) {
          const fd = new FormData();
          fd.append("file", f);
          const r = await fetch(`${apiBase()}/proposals/parse-document`, { method: "POST", credentials: "include", body: fd });
          const body = await r.json().catch(() => ({})) as { html?: string; text?: string; error?: string };
          if (!r.ok) throw new Error(body.error ?? t("common.error"));
          text = body.html ? htmlToMarkdown(body.html) : body.text ?? "";
        } else if (/\.md$/i.test(f.name)) {
          text = await f.text();
        } else {
          text = (await extractOutlineFromFile(f)).text;
        }
        if (!text.trim()) throw new Error(t("contractScope.emptyFile"));
        applyAnalysis(analysisFromText(f.name, text));
        toast({ title: t("contractScope.fileRead", { name: f.name }) });
      }
    } catch (err) {
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const chosenPkg = analysis?.packages.find((p) => p.number === pkgNo);
  const included = analysis && chosenPkg ? packagesUpTo(analysis, chosenPkg.number) : [];
  const itemCount = included.reduce((s, p) => s + p.items.length, 0);
  const duration = chosenPkg?.durations.find((d) => d.mode === mode);
  const deliveryText = duration ? `${modeLabel(duration.mode)} ${duration.weeks} أسبوعاً${duration.delivery ? `، التسليم المتوقع ${duration.delivery}` : ""}` : "";
  const plan = analysis && chosenPkg ? deliveryPlan(analysis, included, mode, every) : [];
  const agreed = chosenPkg ? `الباقة المتفق عليها: ${chosenPkg.name}${analysis!.packages.length > 1 ? ` (باقة ${chosenPkg.number})` : ""}${deliveryText ? ` — ${deliveryText}` : ""}` : "";

  /** The proposal's phases, when the plan follows them and they hold the requirements */
  const docPhases = analysis && chosenPkg && every === "phases" ? phasesOf(analysis, included, mode).filter((x) => x.deliverables.length) : [];
  /** Every requirement of the chosen package (and those it builds on), word for word — by phase when the proposal is phased */
  const annexSections = () => docPhases.length ? docPhases.map((x) => ({
    title: `${phaseLabel(x, mode)} (${x.deliverables.length} متطلب)`,
    items: x.deliverables.map((d) => d.title),
  })) : included.map((p, i) => ({
    title: included.length === 1 ? (analysis!.packages.length > 1 ? `متطلبات باقة ${p.name}` : "نطاق العمل والمتطلبات") : i === 0 ? `متطلبات باقة ${p.name}` : `المتطلبات المضافة في باقة ${p.name}`,
    items: p.items.map((x) => (x.detail ? `${x.title} (${x.detail})` : x.title)),
  }));
  const durationClause = () => (duration ? [{
    title: "الباقة ومدة التنفيذ",
    text: `${type === "client" ? "يلتزم الطرف الأول" : "يلتزم الطرف الثاني"} بتنفيذ جميع متطلبات باقة «${chosenPkg!.name}» الواردة في الملحق رقم (1) خلال ${duration.weeks} أسبوعاً (${modeLabel(duration.mode)})${analysis!.startDate ? ` تبدأ من ${analysis!.startDate}` : " من تاريخ بدء العمل"}${duration.delivery ? `، ويكون التسليم المتوقع في ${duration.delivery}` : ""}، وتشمل المدة أسبوع القبول والتسليم الأخير.`,
  }] : []);

  const merge = async (withAi: boolean) => {
    if (!analysis || !chosenPkg) return;
    // Phased proposal: the annex lists each phase's requirements, the plan says what each phase delivers and the payment due
    const schedule = docPhases.length
      ? docPhases.map((x) => ({ label: phaseLabel(x, mode), items: [x.summary || `جميع متطلبات المرحلة الواردة في الملحق (${x.deliverables.length} متطلب)`, ...(x.payment ? [`بعد تسليم المرحلة وقبولها تُستحق ${x.payment}`] : [])] }))
      : plan;
    const base: ContractScope = { source: analysis.source, agreed, summary: analysis.summary, sections: annexSections(), clauses: durationClause(), schedule, notes: analysis.notes ?? [], placement: value?.placement };
    // The proposal ties a payment to each phase: the contract's payment schedule follows the phases
    const followPhases = () => {
      if (docPhases.length && docPhases.some((x) => x.payment) && onFillStages) {
        onFillStages(schedule, { keepPcts: true });
        toast({ title: t("contractScope.stagesFilled", { count: schedule.length }) });
      }
      const weeks = Number(duration?.weeks);
      if (onDuration && Number.isFinite(weeks) && weeks > 0) onDuration(weeks);
    };
    if (!withAi) {
      onChange(base);
      followPhases();
      toast({ title: t("contractScope.merged", { count: itemCount }) });
      return;
    }
    if (!aiStatus?.configured) {
      toast({ title: t("proposals.aiNotSetUp"), description: t("proposals.aiNotSetUpHint"), variant: "destructive" });
      return;
    }
    setBusy("ai");
    try {
      const text = [analysis.projectTitle, analysis.summary,
        ...included.map((p) => `## ${p.name}\n${p.items.map((x) => `- ${x.title}${x.detail ? ` (${x.detail})` : ""}`).join("\n")}`),
        analysis.text.slice(0, 30_000)].filter(Boolean).join("\n\n");
      const body = await aiRequest<ContractScope>("/ai/contract-scope", {
        type, projectName: projectName || analysis.projectTitle, partyName, packageName: analysis.packages.length > 1 ? chosenPkg.name : undefined, delivery: deliveryText || undefined, startDate: analysis.startDate || undefined, annexProvided: true, text,
        schedule: plan.map((x) => `${x.label}: ${x.items.join("، ")}`).join("\n") || undefined,
      });
      onChange({ ...base, summary: body.summary || base.summary, clauses: body.clauses?.length ? body.clauses : base.clauses });
      followPhases();
      toast({ title: t("contractScope.aiDone", { sections: base.sections.length, clauses: body.clauses?.length ?? 0 }) });
    } catch (err) {
      toast({ title: t("proposals.aiFailed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const scope = value;
  const setSection = (i: number, patch: Partial<ContractScope["sections"][number]>) =>
    scope && onChange({ ...scope, sections: scope.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setClause = (i: number, patch: Partial<ContractScope["clauses"][number]>) =>
    scope && onChange({ ...scope, clauses: scope.clauses.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="contract-scope">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><FileText className="h-4 w-4" />{t("contractScope.title")}</div>
      <p className="text-[11px] text-muted-foreground">{t(type === "client" ? "contractScope.introClient" : "contractScope.introFreelancer")}</p>

      {/* 1. The technical proposal */}
      <div className="space-y-1">
        <Label className="text-xs">{t("contractScope.fromProposal")}</Label>
        <SearchSelect value={pick} onChange={pickProposal} testId="select-scope-proposal" placeholder={t("contractScope.chooseProposal")}
          options={[...technical].sort((a, b) => Number(b.mine) - Number(a.mine)).map((x) => ({ value: String(x.p.id), label: x.label, hint: x.mine ? t("contractScope.thisClient") : x.p.createdAt.slice(0, 10) }))} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} data-testid="input-scope-file" />
        <Button size="sm" variant="outline" className="h-8" onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="button-scope-upload">
          {busy === "file" ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Upload className="h-4 w-4 me-1" />}
          {busy === "file" ? t("contractScope.analyzing") : t("contractScope.uploadFile")}
        </Button>
        {!aiStatus?.configured && <span className="text-[11px] text-muted-foreground">{t("contractScope.noAiUpload")} <Link href="/settings" className="text-primary underline">{t("proposals.aiOpenSettings")}</Link></span>}
      </div>

      {/* 2. Its packages: which one does the client take? */}
      {analysis && (
        <div className="space-y-2 rounded border border-border bg-background/40 p-2" data-testid="scope-analysis">
          <div className="text-xs">
            <span className="font-semibold">{analysis.projectTitle || analysis.source}</span>
            {analysis.startDate && <span className="text-muted-foreground"> · {t("contractScope.start")}: {analysis.startDate}</span>}
          </div>
          {analysis.summary && <p className="text-[11px] text-muted-foreground">{analysis.summary}</p>}
          {analysis.chosen ? (
            <p className="text-[11px] text-green-500 flex items-start gap-1" data-testid="scope-chosen-hint"><CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {t("contractScope.chosenByDoc", { name: analysis.packages.find((p) => p.number === analysis.chosen!.number)?.name ?? "" })}{analysis.chosen.reason ? ` — ${analysis.chosen.reason}` : ""}</p>
          ) : analysis.packages.length > 1 && <p className="text-[11px] text-amber-500">{t("contractScope.pickPackage")}</p>}
          <div className="grid gap-2">
            {analysis.packages.map((p) => {
              const all = packagesUpTo(analysis, p.number).reduce((s, x) => s + x.items.length, 0);
              const on = p.number === pkgNo;
              return (
                <button key={p.number} type="button" onClick={() => { setPkgNo(p.number); setMode(p.durations[0]?.mode ?? ""); }}
                  className={`text-start rounded border p-2 transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`} data-testid={`scope-package-${p.number}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{analysis.packages.length > 1 ? `${t("contractScope.packageN", { n: p.number })}: ` : ""}{p.name}</span>
                    {on && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("contractScope.itemsCount", { count: all })}{p.includesPrevious ? ` (${t("contractScope.withPrevious", { count: p.items.length })})` : ""}
                    {p.durations.map((d) => ` · ${modeLabel(d.mode)} ${d.weeks} أسبوعاً${d.delivery ? ` (${d.delivery})` : ""}`).join("")}
                  </div>
                  {!!p.expectedOwn && p.items.length < p.expectedOwn && (
                    <div className="text-[11px] text-amber-500" data-testid={`scope-short-${p.number}`}>{t("contractScope.short", { got: p.items.length, want: p.expectedOwn })}</div>
                  )}
                </button>
              );
            })}
          </div>
          {chosenPkg && chosenPkg.durations.length > 1 && (
            <div className="flex items-center gap-3 text-xs flex-wrap" data-testid="scope-mode">
              <span className="text-muted-foreground">{t("contractScope.delivery")}</span>
              {chosenPkg.durations.map((d) => (
                <label key={d.mode} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="scope-mode" checked={mode === d.mode} onChange={() => setMode(d.mode)} className="accent-[hsl(var(--primary))]" />
                  {modeLabel(d.mode)} {d.weeks} أسبوعاً
                </label>
              ))}
            </div>
          )}
          {lastFile && analysis.packages.some((p) => !!p.expectedOwn && p.items.length < p.expectedOwn) && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/40 text-amber-500" onClick={() => upload(lastFile)} disabled={!!busy} data-testid="button-scope-reanalyze">
              <Sparkles className="h-3.5 w-3.5 me-1" />{t("contractScope.reanalyze")}
            </Button>
          )}
          {chosenPkg && (analysis.phases?.length || included.some((p) => p.items.some((x) => x.normal || x.compressed))) && (
            <div className="space-y-1" data-testid="scope-plan">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="font-semibold">{t("contractScope.plan")}</span>
                <select className="h-7 rounded border border-border bg-background px-1 text-xs" value={String(every)} onChange={(e) => setEvery(e.target.value === "phases" ? "phases" : Number(e.target.value))} data-testid="select-scope-every">
                  {!!analysis.phases?.length && <option value="phases">{t("contractScope.byDocPhases")}</option>}
                  {[2, 3, 4, 6].map((n) => <option key={n} value={n}>{t("contractScope.everyWeeks", { n })}</option>)}
                </select>
              </div>
              {plan.length ? (
                <div className="max-h-48 overflow-y-auto rounded bg-muted/30 p-2 text-[11px] space-y-1">
                  {plan.map((x, i) => <div key={i}><span className="font-semibold text-primary">{x.label}{every === "phases" ? ` (${x.items.length})` : ""}:</span> {x.items.join("، ")}</div>)}
                </div>
              ) : <p className="text-[11px] text-muted-foreground">{t("contractScope.noPlan")}</p>}
            </div>
          )}
          {chosenPkg && (
            <>
              <button type="button" className="text-[11px] text-primary flex items-center gap-1" onClick={() => setShowItems((v) => !v)} data-testid="toggle-scope-items">
                {showItems ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{t("contractScope.showItems", { count: itemCount })}
              </button>
              {showItems && (
                <div className="max-h-56 overflow-y-auto text-[11px] space-y-1 rounded bg-muted/30 p-2">
                  {included.map((p) => (
                    <div key={p.number}><div className="font-semibold">{p.name}</div>
                      <ol className="list-decimal ps-5">{p.items.map((x, i) => <li key={i}>{x.title}{x.detail ? <span className="text-muted-foreground"> — {x.detail}</span> : null}</li>)}</ol></div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" className="h-8" onClick={() => merge(true)} disabled={!!busy} data-testid="button-scope-ai">
                  {busy === "ai" ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Sparkles className="h-4 w-4 me-1" />}{busy === "ai" ? t("contractScope.aiWorking") : t("contractScope.withAi")}
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => merge(false)} disabled={!!busy} data-testid="button-scope-plain">
                  <Wand2 className="h-4 w-4 me-1" />{t("contractScope.withoutAi")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. What is in the contract (editable) */}
      {scope && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="scope-editor">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{scope.source ? t("contractScope.readFrom", { source: scope.source }) : ""}</span>
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => onChange(undefined)} data-testid="button-scope-clear"><Trash2 className="h-3.5 w-3.5 me-1" />{t("contractScope.remove")}</Button>
          </div>
          <div className="space-y-1" data-testid="scope-placement">
            <Label className="text-xs">{t("contractScope.placement")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["annex", "clause"] as const).map((pl) => {
                const on = (scope.placement ?? "annex") === pl;
                return (
                  <button key={pl} type="button" onClick={() => onChange({ ...scope, placement: pl })} data-testid={`scope-placement-${pl}`}
                    className={`text-start rounded border p-2 text-xs ${on ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                    <div className="font-semibold flex items-center gap-1">{on && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}{t(`contractScope.placement_${pl}`)}</div>
                    <div className="text-[11px] text-muted-foreground">{t(`contractScope.placement_${pl}_hint`)}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("contractScope.agreed")}</Label>
            <Input className="h-8 text-sm" value={scope.agreed ?? ""} onChange={(e) => onChange({ ...scope, agreed: e.target.value })} data-testid="input-scope-agreed" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("contractScope.summary")}</Label>
            <Textarea rows={2} className="text-sm" value={scope.summary ?? ""} onChange={(e) => onChange({ ...scope, summary: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("contractScope.annex")}</Label>
            {scope.sections.map((x, i) => (
              <div key={i} className="rounded border border-border p-2 space-y-1.5" data-testid={`scope-section-${i}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-8 text-sm" value={x.title} onChange={(e) => setSection(i, { title: e.target.value })} placeholder={t("contractScope.sectionTitle")} />
                  <button type="button" onClick={() => onChange({ ...scope, sections: scope.sections.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" title={t("common.delete")}><X className="h-4 w-4" /></button>
                </div>
                <Textarea rows={Math.min(10, Math.max(2, x.items.length + 1))} className="text-xs" value={x.items.join("\n")}
                  onChange={(e) => setSection(i, { items: e.target.value.split("\n") })} placeholder={t("contractScope.itemsHint")} />
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => onChange({ ...scope, sections: [...scope.sections, { title: "", items: [] }] })}><Plus className="h-4 w-4 me-1" />{t("contractScope.addSection")}</Button>
          </div>
          {!!scope.schedule?.length && (
            <div className="space-y-2" data-testid="scope-schedule">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs">{t("contractScope.planInContract")}</Label>
                {onFillStages && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onFillStages(scope.schedule!); toast({ title: t("contractScope.stagesFilled", { count: scope.schedule!.length }) }); }} data-testid="button-fill-stages">
                  <Wand2 className="h-3.5 w-3.5 me-1" />{t("contractScope.fillStages")}</Button>}
              </div>
              {scope.schedule.map((x, i) => (
                <div key={i} className="rounded border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Input className="h-8 text-sm" value={x.label} onChange={(e) => onChange({ ...scope, schedule: scope.schedule!.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                    <button type="button" onClick={() => onChange({ ...scope, schedule: scope.schedule!.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" title={t("common.delete")}><X className="h-4 w-4" /></button>
                  </div>
                  <Textarea rows={Math.min(6, Math.max(2, x.items.length))} className="text-xs" value={x.items.join("\n")} onChange={(e) => onChange({ ...scope, schedule: scope.schedule!.map((y, j) => (j === i ? { ...y, items: e.target.value.split("\n") } : y)) })} />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs">{t("contractScope.clauses")}</Label>
            {scope.clauses.map((c, i) => (
              <div key={i} className="rounded border border-border p-2 space-y-1.5" data-testid={`scope-clause-${i}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-8 text-sm" value={c.title} onChange={(e) => setClause(i, { title: e.target.value })} placeholder={t("contractScope.clauseTitle")} />
                  <button type="button" onClick={() => onChange({ ...scope, clauses: scope.clauses.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" title={t("common.delete")}><X className="h-4 w-4" /></button>
                </div>
                <Textarea rows={3} className="text-xs" value={c.text} onChange={(e) => setClause(i, { text: e.target.value })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => onChange({ ...scope, clauses: [...scope.clauses, { title: "", text: "" }] })}><Plus className="h-4 w-4 me-1" />{t("contractScope.addClause")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
