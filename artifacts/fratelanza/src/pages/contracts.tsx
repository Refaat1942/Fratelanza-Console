import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useListContracts, getListContractsQueryKey, useCreateContract, useUpdateContract, useDeleteContract,
  useListProjects, useListClients, type Contract,
} from "@workspace/api-client-react";
import { useBranding } from "@/lib/branding-context";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Plus, Printer, Pencil, Trash2, FileDown, Save, X, AlertTriangle } from "lucide-react";
import {
  type ContractType, type ClientContractData, type FreelancerContractData,
  defaultClientContract, defaultFreelancerContract, computeStages, amountToArabicWords, arabicDayName,
  buildClientContractHtml, buildFreelancerContractHtml, printContractHtml, downloadContractWord, formatMoney,
} from "@/lib/contract-document";

type ProjectLite = { id: number; projectName: string; clientName?: string | null; clientPrice: number; paidAmount: number };
type Member = { freelancerName: string; commission: number; paid: number; owed: number };

const apiBase = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type Editing = {
  id: number | null;
  number?: string;
  type: ContractType;
  projectId: number | null;
  client: ClientContractData;
  freelancer: FreelancerContractData;
};

function fromSaved(c: Contract): Editing {
  const data = (c.data ?? {}) as Record<string, unknown>;
  return {
    id: c.id,
    number: c.number,
    type: c.type === "freelancer" ? "freelancer" : "client",
    projectId: c.projectId ?? null,
    client: { ...defaultClientContract(), ...(c.type === "client" ? data : {}) } as ClientContractData,
    freelancer: { ...defaultFreelancerContract(), ...(c.type === "freelancer" ? data : {}) } as FreelancerContractData,
  };
}

export default function Contracts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const branding = useBranding();
  const { data: contracts = [] } = useListContracts();
  const { data: projects = [] } = useListProjects();
  const { data: clients = [] } = useListClients();
  const create = useCreateContract();
  const update = useUpdateContract();
  const del = useDeleteContract();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListContractsQueryKey() });
  const projectList = projects as unknown as ProjectLite[];

  const startNew = (type: ContractType) =>
    setEditing({ id: null, type, projectId: null, client: defaultClientContract(), freelancer: defaultFreelancerContract() });

  // Team of the selected project (for the freelancer contract)
  useEffect(() => {
    if (!editing?.projectId || editing.type !== "freelancer") { setMembers([]); return; }
    fetch(`${apiBase()}/projects/${editing.projectId}/freelancer-payments`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { members?: Member[] } | null) => setMembers(d?.members ?? []))
      .catch(() => setMembers([]));
  }, [editing?.projectId, editing?.type]);

  const setClient = (patch: Partial<ClientContractData>) => setEditing((e) => (e ? { ...e, client: { ...e.client, ...patch } } : e));
  const setFreelancer = (patch: Partial<FreelancerContractData>) => setEditing((e) => (e ? { ...e, freelancer: { ...e.freelancer, ...patch } } : e));

  /** Fill the contract from a project: client, price, what was already paid. */
  const pickProject = (idStr: string) => {
    if (!editing) return;
    const id = idStr === "none" ? null : Number(idStr);
    const p = projectList.find((x) => x.id === id);
    setEditing({ ...editing, projectId: id });
    if (!p) return;
    if (editing.type === "client") {
      const cl = (clients as { name: string; address?: string | null }[]).find((c) => c.name.trim().toLowerCase() === (p.clientName ?? "").trim().toLowerCase());
      setClient({
        projectName: p.projectName,
        clientName: p.clientName ?? "",
        clientAddress: cl?.address ?? editing.client.clientAddress,
        totalPrice: Number(p.clientPrice),
        paidSoFar: Number(p.paidAmount),
        subject: editing.client.subject || `بتصميم وبرمجة وتطوير ${p.projectName}`,
      });
    } else {
      const clientContract = (contracts as Contract[]).find((c) => c.type === "client" && c.projectId === p.id);
      setFreelancer({
        projectName: p.projectName,
        originalContractDate: String((clientContract?.data as Record<string, unknown> | undefined)?.contractDate ?? editing.freelancer.originalContractDate),
      });
    }
  };

  const pickFreelancer = (name: string) => {
    const m = members.find((x) => x.freelancerName === name);
    setFreelancer({ freelancerName: name, amount: m ? m.commission : editing?.freelancer.amount ?? 0, paidSoFar: m ? m.paid : 0 });
  };

  const html = useMemo(() => {
    if (!editing) return "";
    const opts = { logoDataUrl: branding.logoDataUrl };
    return editing.type === "client" ? buildClientContractHtml(editing.client, opts) : buildFreelancerContractHtml(editing.freelancer, opts);
  }, [editing, branding.logoDataUrl]);

  const calc = editing
    ? editing.type === "client"
      ? computeStages(editing.client.totalPrice, editing.client.stages, editing.client.paidSoFar)
      : computeStages(editing.freelancer.amount, editing.freelancer.stages, editing.freelancer.paidSoFar)
    : null;

  const save = async (): Promise<Editing | null> => {
    if (!editing) return null;
    const isClient = editing.type === "client";
    const payload = {
      type: editing.type,
      projectId: editing.projectId,
      partyName: isClient ? editing.client.clientName : editing.freelancer.freelancerName,
      amount: isClient ? editing.client.totalPrice : editing.freelancer.amount,
      data: (isClient ? editing.client : editing.freelancer) as unknown as Record<string, unknown>,
    };
    try {
      const saved = editing.id
        ? await update.mutateAsync({ id: editing.id, data: payload })
        : await create.mutateAsync({ data: payload });
      invalidate();
      const next = { ...editing, id: saved.id, number: saved.number };
      setEditing(next);
      toast({ title: t("contracts.saved") });
      return next;
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
      return null;
    }
  };

  const print = async () => {
    const saved = await save();
    if (!saved) return;
    const opts = { logoDataUrl: branding.logoDataUrl };
    const out = saved.type === "client" ? buildClientContractHtml(saved.client, opts) : buildFreelancerContractHtml(saved.freelancer, opts);
    if (!printContractHtml(out)) toast({ title: t("contracts.popupBlocked"), variant: "destructive" });
  };

  const word = () => {
    if (!editing) return;
    const name = editing.type === "client" ? editing.client.clientName : editing.freelancer.freelancerName;
    downloadContractWord(html, `contract-${name || editing.type}`.replace(/\s+/g, "-"));
  };

  const printSaved = (c: Contract) => {
    const e = fromSaved(c);
    const opts = { logoDataUrl: branding.logoDataUrl };
    printContractHtml(e.type === "client" ? buildClientContractHtml(e.client, opts) : buildFreelancerContractHtml(e.freelancer, opts));
  };

  const remove = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId }, { onSuccess: () => { invalidate(); setDeleteId(null); } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileSignature className="h-6 w-6 text-primary" />{t("contracts.title")}</h1>
        <div className="flex gap-2">
          <Button onClick={() => startNew("client")} data-testid="button-new-client-contract"><Plus className="h-4 w-4 me-1" />{t("contracts.newClient")}</Button>
          <Button variant="outline" onClick={() => startNew("freelancer")} data-testid="button-new-freelancer-contract"><Plus className="h-4 w-4 me-1" />{t("contracts.newFreelancer")}</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="border-b border-border">
              {[t("contracts.type"), t("contracts.party"), t("contracts.project"), t("contracts.amount"), t("contracts.date"), ""].map((h, i) => (
                <th key={i} className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(contracts as Contract[]).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t("contracts.none")}</td></tr>
            ) : (contracts as Contract[]).map((c) => (
              <tr key={c.id} className="border-b border-border hover:bg-card/50" data-testid={`row-contract-${c.id}`}>
                <td className="px-4 py-3"><Badge variant="outline" className={c.type === "client" ? "text-blue-400 border-blue-500/30" : "text-yellow-400 border-yellow-500/30"}>{c.type === "client" ? t("contracts.typeClient") : t("contracts.typeFreelancer")}</Badge></td>
                <td className="px-4 py-3 font-medium">{c.partyName || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{projectList.find((p) => p.id === c.projectId)?.projectName ?? String((c.data as Record<string, unknown>)?.projectName ?? "—")}</td>
                <td className="px-4 py-3 whitespace-nowrap"><PrivacyWrapper value={c.amount} /></td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{String((c.data as Record<string, unknown>)?.contractDate ?? c.createdAt.slice(0, 10))}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => printSaved(c)}><Printer className="h-3.5 w-3.5 me-1" />{t("contracts.print")}</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(fromSaved(c))}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[94vh] p-0 flex flex-col gap-0">
          {editing && (
            <>
              <DialogHeader className="px-5 py-3 border-b border-border flex-row items-center justify-between space-y-0">
                <DialogTitle>
                  {editing.type === "client" ? t("contracts.newClient") : t("contracts.newFreelancer")}
                </DialogTitle>
                <div className="flex gap-2 me-8">
                  <Button variant="outline" size="sm" onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-contract"><Save className="h-4 w-4 me-1" />{t("common.save")}</Button>
                  <Button variant="outline" size="sm" onClick={word}><FileDown className="h-4 w-4 me-1" />Word</Button>
                  <Button size="sm" onClick={print} disabled={!calc?.valid} data-testid="button-print-contract" className="bg-green-600 hover:bg-green-700 text-white"><Printer className="h-4 w-4 me-1" />{t("contracts.printPdf")}</Button>
                </div>
              </DialogHeader>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(380px,460px)_1fr] min-h-0">
                <div className="overflow-y-auto p-5 space-y-4 border-e border-border">
                  <Field label={t("contracts.linkProject")}>
                    <Select value={editing.projectId ? String(editing.projectId) : "none"} onValueChange={pickProject}>
                      <SelectTrigger data-testid="select-contract-project"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("contracts.noProject")}</SelectItem>
                        {projectList.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.projectName}{p.clientName ? ` — ${p.clientName}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {editing.type === "client"
                    ? <ClientForm d={editing.client} set={setClient} />
                    : <FreelancerForm d={editing.freelancer} set={setFreelancer} members={members} pickFreelancer={pickFreelancer} />}
                  {calc && <MoneySummary calc={calc} paidLabel={editing.type === "client" ? t("contracts.paidByClient") : t("contracts.paidToFreelancer")} />}
                </div>
                <div className="bg-muted/40 min-h-0">
                  <LivePreview html={html} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("contracts.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("common.deleteConfirmDesc")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</div>
      {children}
    </div>
  );
}

function AmountField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <Field label={label} hint={value ? `فقط ${amountToArabicWords(value)} جنيهاً مصرياً لا غير` : undefined}>
      <Input type="number" dir="ltr" value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)} data-testid="input-contract-amount" />
    </Field>
  );
}

function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Field label={label} hint={value ? `يوم ${arabicDayName(value)}` : undefined}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function ClientForm({ d, set }: { d: ClientContractData; set: (p: Partial<ClientContractData>) => void }) {
  const { t } = useTranslation();
  const calc = computeStages(d.totalPrice, d.stages, d.paidSoFar);
  return (
    <>
      <Section title={t("contracts.sDate")}>
        <DateField label={t("contracts.contractDate")} value={d.contractDate} onChange={(v) => set({ contractDate: v })} />
      </Section>
      <Section title={t("contracts.sClient")}>
        <Field label={t("contracts.clientType")}>
          <Select value={d.clientType} onValueChange={(v) => set({ clientType: v as ClientContractData["clientType"], nationality: v === "company" ? "مصرية" : "مصري" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">{t("contracts.company")}</SelectItem>
              <SelectItem value="individual">{t("contracts.individual")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={d.clientType === "company" ? t("contracts.companyName") : t("contracts.clientName")}><Input value={d.clientName} onChange={(e) => set({ clientName: e.target.value })} data-testid="input-client-name" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("contracts.nationality")}><Input value={d.nationality} onChange={(e) => set({ nationality: e.target.value })} /></Field>
          <Field label={d.clientType === "company" ? t("contracts.idOrRegistry") : t("contracts.nationalId")}><Input dir="ltr" value={d.idNumber} onChange={(e) => set({ idNumber: e.target.value })} /></Field>
        </div>
        <Field label={t("contracts.address")}><Input value={d.clientAddress} onChange={(e) => set({ clientAddress: e.target.value })} /></Field>
        {d.clientType === "company" && (
          <Field label={t("contracts.representative")}><Input value={d.representativeName} onChange={(e) => set({ representativeName: e.target.value })} /></Field>
        )}
      </Section>
      <Section title={t("contracts.sProject")}>
        <Field label={t("contracts.projectName")}><Input value={d.projectName} onChange={(e) => set({ projectName: e.target.value })} /></Field>
        <Field label={t("contracts.subject")} hint={t("contracts.subjectHint")}><Textarea rows={2} value={d.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
        <Field label={t("contracts.durationDays")}><Input type="number" value={d.durationDays} onChange={(e) => set({ durationDays: e.target.value })} /></Field>
      </Section>
      <Section title={t("contracts.sPayment")}>
        <AmountField label={t("contracts.totalPrice")} value={d.totalPrice} onChange={(v) => set({ totalPrice: v })} />
        <StagesEditor
          rows={calc.rows}
          onChange={(i, patch) => set({ stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) })}
          onAdd={() => set({ stages: [...d.stages, { label: `الدفعة ${d.stages.length + 1}`, pct: 0 }] })}
          onRemove={(i) => set({ stages: d.stages.filter((_, j) => j !== i) })}
          pctSum={calc.pctSum}
        />
        <Field label={t("contracts.paymentNotes")}><Textarea rows={2} value={d.paymentNotes} onChange={(e) => set({ paymentNotes: e.target.value })} /></Field>
        <PaidToggle show={d.showPaid} onChange={(v) => set({ showPaid: v })} paid={d.paidSoFar} onPaid={(v) => set({ paidSoFar: v })} />
      </Section>
      <Section title={t("contracts.sTerms")}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("contracts.hourlyRate")}><Input type="number" value={d.hourlyRate} onChange={(e) => set({ hourlyRate: e.target.value })} /></Field>
          <Field label={t("contracts.supportMonths")}><Input type="number" value={d.supportMonths} onChange={(e) => set({ supportMonths: e.target.value })} /></Field>
        </div>
        <Field label={t("contracts.court")} hint={t("contracts.courtHint")}><Input value={d.court} onChange={(e) => set({ court: e.target.value })} /></Field>
      </Section>
      <Section title={t("contracts.sSignatory")}>
        <Field label={t("contracts.signatoryName")} hint={t("contracts.signatoryHint")}><Input value={d.signatoryName} onChange={(e) => set({ signatoryName: e.target.value })} /></Field>
        <Field label={t("contracts.signatoryTitle")}><Input value={d.signatoryTitle} onChange={(e) => set({ signatoryTitle: e.target.value })} /></Field>
      </Section>
    </>
  );
}

function FreelancerForm({ d, set, members, pickFreelancer }: { d: FreelancerContractData; set: (p: Partial<FreelancerContractData>) => void; members: Member[]; pickFreelancer: (name: string) => void }) {
  const { t } = useTranslation();
  const calc = computeStages(d.amount, d.stages, d.paidSoFar);
  return (
    <>
      <Section title={t("contracts.sDate")}>
        <DateField label={t("contracts.contractDate")} value={d.contractDate} onChange={(v) => set({ contractDate: v })} />
      </Section>
      <Section title={t("contracts.sFreelancer")}>
        {members.length > 0 ? (
          <Field label={t("contracts.freelancerFromProject")}>
            <Select value={members.some((m) => m.freelancerName === d.freelancerName) ? d.freelancerName : ""} onValueChange={pickFreelancer}>
              <SelectTrigger data-testid="select-contract-freelancer"><SelectValue placeholder={t("contracts.chooseFreelancer")} /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.freelancerName} value={m.freelancerName}>{m.freelancerName} — {formatMoney(m.commission)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label={t("contracts.freelancerName")}><Input value={d.freelancerName} onChange={(e) => set({ freelancerName: e.target.value })} data-testid="input-freelancer-name" /></Field>
        <Field label={t("contracts.nationalId")}><Input dir="ltr" value={d.freelancerNationalId} onChange={(e) => set({ freelancerNationalId: e.target.value })} /></Field>
      </Section>
      <Section title={t("contracts.sOriginal")}>
        <Field label={t("contracts.projectName")}><Input value={d.projectName} onChange={(e) => set({ projectName: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("contracts.originalNumber")}><Input dir="ltr" value={d.originalContractNumber} onChange={(e) => set({ originalContractNumber: e.target.value })} /></Field>
          <DateField label={t("contracts.originalDate")} value={d.originalContractDate} onChange={(v) => set({ originalContractDate: v })} />
        </div>
      </Section>
      <Section title={t("contracts.sPayment")}>
        <AmountField label={t("contracts.freelancerAmount")} value={d.amount} onChange={(v) => set({ amount: v })} />
        <StagesEditor
          rows={calc.rows}
          detailed
          onChange={(i, patch) => set({ stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) })}
          onAdd={() => set({ stages: [...d.stages, { label: `الدفعة ${d.stages.length + 1}`, pct: 0, due: "", deliverable: "" }] })}
          onRemove={(i) => set({ stages: d.stages.filter((_, j) => j !== i) })}
          pctSum={calc.pctSum}
        />
        <Field label={t("contracts.payWithinDays")}><Input type="number" value={d.payWithinDays} onChange={(e) => set({ payWithinDays: e.target.value })} /></Field>
        <PaidToggle show={d.showPaid} onChange={(v) => set({ showPaid: v })} paid={d.paidSoFar} onPaid={(v) => set({ paidSoFar: v })} />
      </Section>
    </>
  );
}

type Row = { label: string; pct: number; amount: number; due?: string; deliverable?: string };

function StagesEditor({ rows, onChange, onAdd, onRemove, pctSum, detailed }: {
  rows: Row[]; onChange: (i: number, patch: Partial<Row>) => void; onAdd: () => void; onRemove: (i: number) => void; pctSum: number; detailed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{t("contracts.stages")}</Label>
        <span className={`text-xs font-semibold ${pctSum === 100 ? "text-green-500" : "text-red-500"}`}>{t("contracts.pctTotal")}: {pctSum}%</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="rounded-md border border-border/70 p-2 space-y-1.5">
          <div className="flex gap-2 items-center">
            <Input className="h-8 flex-1" value={r.label} onChange={(e) => onChange(i, { label: e.target.value })} />
            <div className="relative w-20"><Input className="h-8 pe-6" type="number" value={r.pct} onChange={(e) => onChange(i, { pct: Number(e.target.value) || 0 })} data-testid={`input-stage-pct-${i}`} /><span className="absolute end-2 top-1.5 text-xs text-muted-foreground">%</span></div>
            <div className="w-28 text-end text-sm font-semibold whitespace-nowrap" data-testid={`stage-amount-${i}`}>{formatMoney(r.amount)}</div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(i)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          {detailed && (
            <div className="grid grid-cols-2 gap-2">
              <Textarea rows={2} className="text-xs" placeholder={t("contracts.due")} value={r.due ?? ""} onChange={(e) => onChange(i, { due: e.target.value })} />
              <Textarea rows={2} className="text-xs" placeholder={t("contracts.deliverable")} value={r.deliverable ?? ""} onChange={(e) => onChange(i, { deliverable: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5 me-1" />{t("contracts.addStage")}</Button>
      {pctSum !== 100 && <div className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" />{t("contracts.pctMustBe100")}</div>}
    </div>
  );
}

function PaidToggle({ show, onChange, paid, onPaid }: { show: boolean; onChange: (v: boolean) => void; paid: number; onPaid: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md bg-muted/40 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{t("contracts.showPaid")}</Label>
        <Switch checked={show} onCheckedChange={onChange} data-testid="switch-show-paid" />
      </div>
      <Field label={t("contracts.paidSoFar")}><Input type="number" dir="ltr" value={paid || ""} onChange={(e) => onPaid(Number(e.target.value) || 0)} /></Field>
    </div>
  );
}

function MoneySummary({ calc, paidLabel }: { calc: ReturnType<typeof computeStages<{ label: string; pct: number }>>; paidLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
      <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.total")}</span><b><PrivacyWrapper value={calc.totalAllocated} /></b></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{paidLabel}</span><b className="text-green-500"><PrivacyWrapper value={calc.paid} /></b></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.remaining")}</span><b className="text-orange-500"><PrivacyWrapper value={calc.remaining} /></b></div>
      <div className="pt-1 text-xs text-muted-foreground">
        {calc.rows.map((r, i) => (
          <div key={i} className="flex justify-between"><span>{r.label} ({r.pct}%)</span><span>{r.remaining === 0 && r.amount > 0 ? `✓ ${t("contracts.stagePaid")}` : r.paid > 0 ? `${t("contracts.stagePartly")} ${formatMoney(r.paid)}` : t("contracts.stageDue")}</span></div>
        ))}
      </div>
    </div>
  );
}

/** A4 preview that redraws in place (no reload, keeps the scroll position) shortly after typing stops. */
function LivePreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const frame = ref.current;
      const doc = frame?.contentDocument;
      if (!frame || !doc) return;
      const y = frame.contentWindow?.scrollY ?? 0;
      doc.open();
      doc.write(html);
      doc.close();
      frame.contentWindow?.scrollTo(0, y);
      frame.dataset.ready = "1";
    }, 250);
    return () => clearTimeout(timer);
  }, [html]);
  return <iframe ref={ref} title="preview" className="w-full h-full border-0 bg-white" data-testid="contract-preview" />;
}
