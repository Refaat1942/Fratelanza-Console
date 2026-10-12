import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useListProposals, getListProposalsQueryKey, useCreateProposal, useUpdateProposal, useDeleteProposal,
  useListClients, getListClientsQueryKey, type Proposal,
} from "@workspace/api-client-react";
import { useBranding } from "@/lib/branding-context";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, ClipboardList, Plus, Pencil, Trash2, Save, FileDown, Printer } from "lucide-react";
import { printContractHtml, downloadContractWord } from "@/lib/contract-document";
import { SERVICES, TIERS, TIER_NAME, serviceByKey, type Tier } from "@/lib/service-catalog";
import {
  buildQuoteHtml, buildTechnicalHtml, defaultProposal, guidePrices, proposalAmount, proposalTotals, normalizeProposal,
  type ProposalData, type ProposalCustomer,
} from "@/lib/proposal-document";

type DocKind = "quote" | "technical";
type Editing = { id: number | null; clientId: number | null; data: ProposalData };

/** Saved row → editable data (missing fields fall back to defaults). */
function fromSaved(p: Proposal): Editing {
  const base = defaultProposal(p.serviceKey);
  const raw = (p.data ?? {}) as Partial<ProposalData>;
  return {
    id: p.id,
    clientId: p.clientId ?? null,
    data: normalizeProposal({
      ...base, ...raw,
      included: raw.included ? { ...base.included, ...raw.included } : (undefined as unknown as ProposalData["included"]),
      customer: { ...base.customer, ...(raw.customer ?? {}) },
      prices: { ...base.prices, ...(raw.prices ?? {}) },
    }),
  };
}

function buildHtml(kind: DocKind, d: ProposalData, logoDataUrl?: string | null) {
  return kind === "quote" ? buildQuoteHtml(d, { logoDataUrl }) : buildTechnicalHtml(d, { logoDataUrl });
}

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
    }, 250);
    return () => clearTimeout(timer);
  }, [html]);
  return <iframe ref={ref} title="preview" className="w-full h-full border-0 bg-white" data-testid="proposal-preview" />;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Print buttons for a saved proposal (used in the list and on the client page). */
export function ProposalPrintButtons({ p, size = "sm" }: { p: Proposal; size?: "sm" | "icon" }) {
  const { t } = useTranslation();
  const branding = useBranding();
  const { toast } = useToast();
  const print = (kind: DocKind) => {
    if (!printContractHtml(buildHtml(kind, fromSaved(p).data, branding.logoDataUrl))) toast({ title: t("contracts.popupBlocked"), variant: "destructive" });
  };
  return (
    <>
      <Button size={size} variant="outline" className="h-8" onClick={() => print("quote")} data-testid={`button-print-quote-${p.id}`} title={t("proposals.printQuote")}>
        <FileText className="h-3.5 w-3.5 sm:me-1" /><span className="hidden sm:inline">{t("proposals.quote")}</span>
      </Button>
      <Button size={size} variant="outline" className="h-8" onClick={() => print("technical")} data-testid={`button-print-technical-${p.id}`} title={t("proposals.printTechnical")}>
        <ClipboardList className="h-3.5 w-3.5 sm:me-1" /><span className="hidden sm:inline">{t("proposals.technical")}</span>
      </Button>
    </>
  );
}

function useServiceName() {
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  return (key: string) => serviceByKey(key).name[ar ? "ar" : "en"];
}

/** Saved quotes / proposals of one client (client page). */
export function ClientProposals({ clientId }: { clientId: number }) {
  const { t } = useTranslation();
  const serviceName = useServiceName();
  const params = { clientId };
  const { data = [] } = useListProposals(params, { query: { queryKey: getListProposalsQueryKey(params) } });
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{t("proposals.clientSection")}</div>
      {data.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("proposals.noneForClient")}</div>
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm" data-testid={`client-proposal-${p.id}`}>
              <div className="min-w-0">
                <div className="font-medium">{serviceName(p.serviceKey)}{p.tier ? ` — ${TIER_NAME[p.tier as Tier] ?? p.tier}` : ""}</div>
                <div className="text-xs text-muted-foreground">{String((p.data as Partial<ProposalData>)?.date ?? p.createdAt.slice(0, 10))}{p.amount > 0 && <> · <PrivacyWrapper value={p.amount} /></>}</div>
              </div>
              <div className="flex gap-1"><ProposalPrintButtons p={p} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Quotes page → "Packages & proposals": sales quotation + technical proposal per service package. */
export function ProposalsPanel({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const branding = useBranding();
  const serviceName = useServiceName();
  const { data: proposals = [], isLoading } = useListProposals();
  const { data: clients = [] } = useListClients();
  const create = useCreateProposal();
  const update = useUpdateProposal();
  const del = useDeleteProposal();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [kind, setKind] = useState<DocKind>("quote");
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProposalsQueryKey() });
    qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
  };

  const html = useMemo(() => (editing ? buildHtml(kind, editing.data, branding.logoDataUrl) : ""), [editing, kind, branding.logoDataUrl]);

  const setData = (patch: Partial<ProposalData>) => setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));
  const setCustomer = (patch: Partial<ProposalCustomer>) => setEditing((e) => (e ? { ...e, data: { ...e.data, customer: { ...e.data.customer, ...patch } } } : e));

  const startNew = () => { setEditing({ id: null, clientId: null, data: defaultProposal() }); setKind("quote"); setMobileView("form"); };

  const pickClient = (v: string) => {
    if (v === "new") { setEditing((e) => (e ? { ...e, clientId: null } : e)); return; }
    const c = clients.find((x) => x.id === Number(v));
    if (!c) return;
    setEditing((e) => (e ? {
      ...e, clientId: c.id,
      data: { ...e.data, customer: { ...e.data.customer, company: c.name, phone: c.phone ?? e.data.customer.phone, address: c.address ?? e.data.customer.address, business: c.activity ?? e.data.customer.business } },
    } : e));
  };

  const pickService = (key: string) => setData({ serviceKey: key, prices: guidePrices(key) });
  const choosePackage = (tier: Tier) => setEditing((e) => (e ? {
    ...e, data: { ...e.data, tier: e.data.tier === tier ? "" : tier, included: { ...e.data.included, [tier]: true } },
  } : e));
  const toggleIncluded = (tier: Tier, on: boolean) => setEditing((e) => {
    if (!e) return e;
    const included = { ...e.data.included, [tier]: on };
    if (!TIERS.some((x) => included[x])) return e; // keep at least one package
    return { ...e, data: { ...e.data, included, tier: !on && e.data.tier === tier ? "" : e.data.tier } };
  });

  const save = async (): Promise<Editing | null> => {
    if (!editing) return null;
    const d = editing.data;
    if (!d.customer.company.trim() && !d.customer.contactName.trim()) {
      toast({ title: t("proposals.nameRequired"), variant: "destructive" });
      return null;
    }
    const payload = {
      clientId: editing.clientId,
      clientName: d.customer.company.trim() || d.customer.contactName.trim(),
      serviceKey: d.serviceKey,
      tier: d.tier,
      language: d.language,
      amount: proposalAmount(d),
      data: d as unknown as Record<string, unknown>,
    };
    try {
      const saved = editing.id ? await update.mutateAsync({ id: editing.id, data: payload }) : await create.mutateAsync({ data: payload });
      invalidate();
      const next = { ...editing, id: saved.id, clientId: saved.clientId ?? null };
      setEditing(next);
      toast({ title: t("proposals.saved") });
      return next;
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
      return null;
    }
  };

  const print = async () => {
    const saved = await save();
    if (!saved) return;
    if (!printContractHtml(buildHtml(kind, saved.data, branding.logoDataUrl))) toast({ title: t("contracts.popupBlocked"), variant: "destructive" });
  };

  const word = () => {
    if (!editing) return;
    const name = editing.data.customer.company || editing.data.customer.contactName || "client";
    downloadContractWord(html, `${kind === "quote" ? "quotation" : "technical-proposal"}-${name}`.replace(/\s+/g, "-"));
  };

  const remove = () => {
    if (deleteId === null) return;
    del.mutate({ id: deleteId }, { onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: t("proposals.deleted") }); } });
  };

  const d = editing?.data;
  const svc = d ? serviceByKey(d.serviceKey) : null;
  const ar = d?.language === "ar";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">{t("proposals.intro")}</p>
        {canWrite && <Button onClick={startNew} data-testid="button-new-proposal"><Plus className="h-4 w-4 me-1" />{t("proposals.new")}</Button>}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground text-sm">{t("proposals.none")}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t("proposals.client"), t("proposals.service"), t("proposals.package"), t("proposals.value"), t("quotes.date"), t("common.actions")].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-card/50" data-testid={`row-proposal-${p.id}`}>
                  <td className="px-3 py-2 font-medium">{p.clientName || "—"}</td>
                  <td className="px-3 py-2">{serviceName(p.serviceKey)}</td>
                  <td className="px-3 py-2">{p.tier ? <Badge variant="outline">{TIER_NAME[p.tier as Tier] ?? p.tier}</Badge> : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-primary">{p.amount > 0 ? <PrivacyWrapper value={p.amount} /> : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{String((p.data as Partial<ProposalData>)?.date ?? p.createdAt.slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <ProposalPrintButtons p={p} />
                      {canWrite && <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title={t("common.edit", { defaultValue: "Edit" })} onClick={() => { setEditing(fromSaved(p)); setKind("quote"); setMobileView("form"); }} data-testid={`button-edit-proposal-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title={t("common.delete")} onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-none w-screen h-[100dvh] rounded-none sm:rounded-lg sm:max-w-[96vw] sm:w-[96vw] sm:h-[94vh] p-0 flex flex-col gap-0">
          {editing && d && svc && (
            <>
              <DialogHeader className="px-3 sm:px-5 py-3 border-b border-border flex-row flex-wrap items-center justify-between gap-2 space-y-0 pe-12 sm:pe-14">
                <DialogTitle>{editing.id ? t("proposals.edit") : t("proposals.new")}</DialogTitle>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex rounded-md border border-primary/40 p-0.5" title={t("proposals.docSwitchHint")}>
                    {(["quote", "technical"] as const).map((k) => (
                      <Button key={k} size="sm" variant={kind === k ? "default" : "ghost"} className="h-8" onClick={() => setKind(k)} data-testid={`toggle-doc-${k}`}>
                        {k === "quote" ? <FileText className="h-4 w-4 me-1" /> : <ClipboardList className="h-4 w-4 me-1" />}
                        {k === "quote" ? t("proposals.quote") : t("proposals.technical")}
                      </Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-proposal"><Save className="h-4 w-4 me-1" />{t("common.save")}</Button>
                  <Button variant="outline" size="sm" onClick={word}><FileDown className="h-4 w-4 me-1" />Word</Button>
                  <Button size="sm" onClick={print} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-print-proposal"><Printer className="h-4 w-4 me-1" />{kind === "quote" ? t("proposals.printQuote") : t("proposals.printTechnical")}</Button>
                </div>
              </DialogHeader>
              <div className="lg:hidden grid grid-cols-2 gap-1 p-2 border-b border-border bg-card/60">
                {(["form", "preview"] as const).map((v) => (
                  <Button key={v} size="sm" variant={mobileView === v ? "default" : "ghost"} onClick={() => setMobileView(v)}>
                    {v === "form" ? t("contracts.viewForm") : t("contracts.viewPreview")}
                  </Button>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(380px,460px)_1fr] min-h-0">
                <div className={`overflow-y-auto p-3 sm:p-5 space-y-5 lg:border-e border-border ${mobileView === "preview" ? "hidden lg:block" : ""}`}>
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-primary">1. {t("proposals.serviceSection")}</h3>
                    <Field label={t("proposals.service")}>
                      <Select value={d.serviceKey} onValueChange={pickService}>
                        <SelectTrigger data-testid="select-service"><SelectValue /></SelectTrigger>
                        <SelectContent>{SERVICES.map((s) => <SelectItem key={s.key} value={s.key}>{serviceName(s.key)}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("proposals.docLanguage")}>
                        <Select value={d.language} onValueChange={(v) => setData({ language: v as "ar" | "en" })}>
                          <SelectTrigger data-testid="select-proposal-language"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
                        </Select>
                      </Field>
                      <Field label={t("quotes.date")}><Input type="date" value={d.date} onChange={(e) => setData({ date: e.target.value })} /></Field>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-primary">2. {t("proposals.customerSection")}</h3>
                    <Field label={t("proposals.existingClient")} hint={editing.clientId ? undefined : t("proposals.newClientHint")}>
                      <Select value={editing.clientId ? String(editing.clientId) : "new"} onValueChange={pickClient}>
                        <SelectTrigger data-testid="select-proposal-client"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">{t("proposals.newClient")}</SelectItem>
                          {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("proposals.company")}><Input value={d.customer.company} onChange={(e) => setCustomer({ company: e.target.value })} data-testid="input-customer-company" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("proposals.contactName")}><Input value={d.customer.contactName} onChange={(e) => setCustomer({ contactName: e.target.value })} data-testid="input-customer-contact" /></Field>
                      <Field label={t("proposals.contactTitle")}><Input value={d.customer.contactTitle} onChange={(e) => setCustomer({ contactTitle: e.target.value })} /></Field>
                      <Field label={t("proposals.phone")}><Input value={d.customer.phone} onChange={(e) => setCustomer({ phone: e.target.value })} /></Field>
                      <Field label={t("proposals.email")}><Input type="email" value={d.customer.email} onChange={(e) => setCustomer({ email: e.target.value })} /></Field>
                    </div>
                    <Field label={t("proposals.address")}><Input value={d.customer.address} onChange={(e) => setCustomer({ address: e.target.value })} /></Field>
                    <Field label={t("proposals.business")} hint={t("proposals.businessHint")}>
                      <Input value={d.customer.business} onChange={(e) => setCustomer({ business: e.target.value })} placeholder={ar ? "مثال: سلسلة صيدليات / تطوير عقاري / مطعم" : "e.g. pharmacy chain / real estate developer / restaurant"} data-testid="input-customer-business" />
                    </Field>
                    <Field label={t("proposals.needs")} hint={t("proposals.needsHint")}>
                      <Textarea rows={2} value={d.customer.needs} onChange={(e) => setCustomer({ needs: e.target.value })} placeholder={ar ? "مثال: نظام لإدارة المخزون والمبيعات لثلاثة فروع" : "e.g. a system to manage stock and sales for three branches"} data-testid="input-customer-needs" />
                    </Field>
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-primary">3. {t("proposals.packagesSection")}</h3>
                    <p className="text-[11px] text-muted-foreground">{t("proposals.packagesHint")}</p>
                    <div className="rounded border border-border divide-y divide-border">
                      {svc.packages.map((pkg) => {
                        const chosen = pkg.tier === d.tier;
                        const on = d.included[pkg.tier] !== false;
                        return (
                          <div key={pkg.tier} className={`p-3 space-y-2 ${chosen ? "bg-primary/10" : ""} ${on ? "" : "opacity-60"}`} data-testid={`package-${pkg.tier}`}>
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={on} onChange={(e) => toggleIncluded(pkg.tier, e.target.checked)} data-testid={`include-${pkg.tier}`} />
                                {TIER_NAME[pkg.tier]}
                              </label>
                              <Input type="number" className="w-32 h-8" value={d.prices[pkg.tier] || ""} onChange={(e) => setData({ prices: { ...d.prices, [pkg.tier]: Number(e.target.value) || 0 } })} data-testid={`input-price-${pkg.tier}`} />
                            </div>
                            <div className="text-[11px] text-muted-foreground">{pkg.features.map((x) => (ar ? x.ar : x.en)).join(" · ")}</div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">{d.prices[pkg.tier] !== pkg.price ? `${t("proposals.guidePrice")}: ${pkg.price.toLocaleString()}` : ""}</span>
                              <Button size="sm" variant={chosen ? "default" : "outline"} className="h-7" onClick={() => choosePackage(pkg.tier)} data-testid={`choose-${pkg.tier}`}>
                                {chosen ? `✓ ${t("proposals.chosen")}` : t("proposals.choose")}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {d.tier ? (() => {
                      const tot = proposalTotals(d);
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Field label={t("proposals.discount")}>
                              <Select value={d.discountType} onValueChange={(v) => setData({ discountType: v as ProposalData["discountType"] })}>
                                <SelectTrigger data-testid="select-discount-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t("proposals.noDiscount")}</SelectItem>
                                  <SelectItem value="percent">{t("proposals.discountPercent")}</SelectItem>
                                  <SelectItem value="amount">{t("proposals.discountAmount")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            {d.discountType !== "none" && (
                              <Field label={d.discountType === "percent" ? "%" : t("proposals.discountAmount")}>
                                <Input type="number" min={0} max={d.discountType === "percent" ? 100 : undefined} value={d.discountValue || ""} onChange={(e) => setData({ discountValue: Number(e.target.value) || 0 })} data-testid="input-discount" />
                              </Field>
                            )}
                          </div>
                          <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-1" data-testid="proposal-totals">
                            <div className="flex justify-between"><span className="text-muted-foreground">{t("proposals.packagePrice", { pkg: TIER_NAME[d.tier as Tier] })}</span><PrivacyWrapper value={tot.subtotal} /></div>
                            {tot.discount > 0 && <div className="flex justify-between text-red-400"><span>{t("proposals.discount")}{d.discountType === "percent" ? ` (${tot.discountPct}%)` : ""}</span><span>− <PrivacyWrapper value={tot.discount} /></span></div>}
                            <div className="flex justify-between font-semibold border-t border-border pt-1"><span>{t("proposals.value")}</span><PrivacyWrapper value={tot.total} /></div>
                          </div>
                        </div>
                      );
                    })() : <p className="text-xs text-muted-foreground">{t("proposals.noChoiceHint")}</p>}
                  </section>

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-primary">4. {t("proposals.termsSection")}</h3>
                    <Field label={t("proposals.validDays")}><Input type="number" value={d.validDays} onChange={(e) => setData({ validDays: Number(e.target.value) || 0 })} /></Field>
                    <Field label={t("proposals.notes")} hint={t("proposals.notesHint")}><Textarea rows={3} value={d.notes} onChange={(e) => setData({ notes: e.target.value })} /></Field>
                  </section>
                </div>
                <div className={`bg-muted/40 min-h-0 ${mobileView === "form" ? "hidden lg:block" : ""}`}>
                  <LivePreview html={html} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("proposals.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
