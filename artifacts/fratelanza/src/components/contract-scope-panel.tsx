import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListProposals, type Proposal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/search-select";
import { useToast } from "@/hooks/use-toast";
import { useAiStatus } from "@/lib/ai-client";
import { normalizeProposal, packageContents, hasSpecTiers, type ProposalData } from "@/lib/proposal-document";
import { TIERS, TIER_NAME, type Tier } from "@/lib/service-catalog";
import { htmlToMarkdown, specItems } from "@/lib/spec-document";
import { extractOutlineFromFile } from "@/lib/outline-file-parser";
import type { ContractScope } from "@/lib/contract-document";
import { FileText, Upload, Sparkles, Wand2, Loader2, Plus, X, Trash2 } from "lucide-react";

const apiBase = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
type Source = { label: string; text: string; data?: ProposalData };

/** The packages up to and including `tier` (cumulative), or all of them. */
const tiersUpTo = (tier: Tier | "all") => (tier === "all" ? TIERS : TIERS.slice(0, TIERS.indexOf(tier) + 1));

/** A technical proposal as text for the AI: its specification, and the chosen packages' items. */
function technicalText(d: ProposalData, tier: Tier | "all"): string {
  const parts: string[] = [];
  if (d.projectTitle?.trim()) parts.push(`# ${d.projectTitle.trim()}`);
  if (d.customer.needs.trim()) parts.push(d.customer.needs.trim());
  if (d.requirementsText.trim()) parts.push(d.requirementsText.trim());
  else if (d.requirements.length) parts.push(d.requirements.map((r) => `- ${r.group ? `${r.group}: ` : ""}${r.text}`).join("\n"));
  if (hasSpecTiers(d)) {
    for (const t of tiersUpTo(tier)) {
      const items = packageContents(d, t);
      if (items.length) parts.push(`## ${TIER_NAME[t]}\n${items.map((x) => `- ${x.title}${x.detail ? ` — ${x.detail}` : ""}`).join("\n")}`);
    }
  }
  return parts.join("\n\n");
}

/** Without AI: the deliverables grouped by section (package items, else the specification's sections). */
function plainScope(src: Source, tier: Tier | "all"): ContractScope {
  const groups = new Map<string, string[]>();
  const add = (title: string, item: string) => {
    const k = title.trim() || "نطاق العمل";
    groups.set(k, [...(groups.get(k) ?? []), item]);
  };
  const d = src.data;
  if (d && hasSpecTiers(d)) {
    for (const t of tiersUpTo(tier)) for (const x of d.tierItems ?? []) if (x.tier === t) add(x.section, x.detail?.trim() ? `${x.text}: ${x.detail}` : x.text);
  } else if (d && !d.requirementsText.trim() && d.requirements.length) {
    for (const r of d.requirements) add(r.group ?? "", r.text);
  } else {
    for (const x of specItems(src.text)) add(x.section === x.text ? "" : x.section, x.text);
  }
  return { source: src.label, sections: [...groups].map(([title, items]) => ({ title, items })), clauses: [] };
}

type Props = {
  type: "client" | "freelancer";
  value?: ContractScope;
  onChange: (v: ContractScope | undefined) => void;
  projectName: string;
  partyName: string;
  /** Client whose technical proposals are listed first */
  clientName?: string;
};

/** Contract editor: read a technical proposal (saved or uploaded) into the contract's annex and project clauses. */
export function ContractScopePanel({ type, value, onChange, projectName, partyName, clientName }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: aiStatus } = useAiStatus();
  const { data: proposals = [] } = useListProposals();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState("");
  const [file, setFile] = useState<Source | null>(null);
  const [tier, setTier] = useState<Tier | "all">("all");
  const [busy, setBusy] = useState<"" | "file" | "ai">("");

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const technical = useMemo(() => (proposals as Proposal[])
    .filter((p) => (p.data as Partial<ProposalData> | undefined)?.kind !== "quote")
    .map((p) => {
      const d = normalizeProposal(p.data as unknown as ProposalData);
      return { p, d, label: `${p.clientName}${d.projectTitle ? ` — ${d.projectTitle}` : ""}`, mine: !!clientName && norm(p.clientName) === norm(clientName) };
    }), [proposals, clientName]);
  const chosen = technical.find((x) => String(x.p.id) === pick);
  const source: Source | null = file ?? (chosen ? { label: chosen.label, text: technicalText(chosen.d, tier), data: chosen.d } : null);

  const pickProposal = (v: string) => {
    setPick(v);
    setFile(null);
    const d = technical.find((x) => String(x.p.id) === v)?.d;
    // The package the client chose in the proposal, else all of them
    setTier(d?.tier || "all");
  };
  const upload = async (f: File) => {
    setBusy("file");
    try {
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
      setFile({ label: f.name, text });
      setPick("");
      setTier("all");
      toast({ title: t("contractScope.fileRead", { name: f.name }) });
    } catch (err) {
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const withAi = async () => {
    if (!source) return;
    if (!aiStatus?.configured) {
      toast({ title: t("proposals.aiNotSetUp"), description: t("proposals.aiNotSetUpHint"), variant: "destructive" });
      return;
    }
    setBusy("ai");
    try {
      const r = await fetch(`${apiBase()}/ai/contract-scope`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, projectName, partyName, packageName: tier === "all" ? undefined : TIER_NAME[tier], text: source.text }),
      });
      const body = await r.json().catch(() => ({})) as ContractScope & { error?: string };
      if (!r.ok) throw new Error(body.error ?? t("common.error"));
      onChange({ source: source.label, summary: body.summary, sections: body.sections ?? [], clauses: body.clauses ?? [] });
      toast({ title: t("contractScope.aiDone", { sections: body.sections?.length ?? 0, clauses: body.clauses?.length ?? 0 }) });
    } catch (err) {
      toast({ title: t("proposals.aiFailed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };
  const withoutAi = () => {
    if (!source) return;
    const s = plainScope(source, tier);
    if (!s.sections.length) {
      toast({ title: t("contractScope.nothingFound"), variant: "destructive" });
      return;
    }
    onChange({ ...s, clauses: value?.clauses ?? [] });
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

      <div className="space-y-1">
        <Label className="text-xs">{t("contractScope.fromProposal")}</Label>
        <SearchSelect value={pick} onChange={pickProposal} testId="select-scope-proposal" placeholder={t("contractScope.chooseProposal")}
          options={[...technical].sort((a, b) => Number(b.mine) - Number(a.mine)).map((x) => ({ value: String(x.p.id), label: x.label, hint: x.mine ? t("contractScope.thisClient") : x.p.createdAt.slice(0, 10) }))} />
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".docx,.pdf,.md,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} data-testid="input-scope-file" />
        <Button size="sm" variant="outline" className="h-8" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === "file" ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Upload className="h-4 w-4 me-1" />}{t("contractScope.uploadFile")}
        </Button>
        {file && <span className="text-xs text-muted-foreground truncate" title={file.label}>{file.label}</span>}
      </div>

      {source && (
        <div className="space-y-2">
          {chosen && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("contractScope.package")}</span>
              <Select value={tier} onValueChange={(v) => setTier(v as Tier | "all")}>
                <SelectTrigger className="h-8 w-44" data-testid="select-scope-tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("contractScope.allPackages")}</SelectItem>
                  {TIERS.map((x) => <SelectItem key={x} value={x}>{TIER_NAME[x]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-8" onClick={withAi} disabled={!!busy} data-testid="button-scope-ai">
              {busy === "ai" ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Sparkles className="h-4 w-4 me-1" />}{busy === "ai" ? t("contractScope.aiWorking") : t("contractScope.withAi")}
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={withoutAi} disabled={!!busy} data-testid="button-scope-plain">
              <Wand2 className="h-4 w-4 me-1" />{t("contractScope.withoutAi")}
            </Button>
          </div>
          {!aiStatus?.configured && <p className="text-[11px] text-muted-foreground">{t("proposals.aiNotSetUpHint")} <Link href="/settings" className="text-primary underline">{t("proposals.aiOpenSettings")}</Link></p>}
        </div>
      )}

      {scope && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="scope-editor">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{scope.source ? t("contractScope.readFrom", { source: scope.source }) : ""}</span>
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => onChange(undefined)} data-testid="button-scope-clear"><Trash2 className="h-3.5 w-3.5 me-1" />{t("contractScope.remove")}</Button>
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
                <Textarea rows={Math.min(8, Math.max(2, x.items.length + 1))} className="text-xs" value={x.items.join("\n")}
                  onChange={(e) => setSection(i, { items: e.target.value.split("\n") })} placeholder={t("contractScope.itemsHint")} />
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => onChange({ ...scope, sections: [...scope.sections, { title: "", items: [] }] })}><Plus className="h-4 w-4 me-1" />{t("contractScope.addSection")}</Button>
          </div>
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
