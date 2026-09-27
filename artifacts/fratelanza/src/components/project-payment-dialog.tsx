import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-methods";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

export type ProjectPaymentRow = {
  id: number;
  amount: number;
  paymentMethod: string;
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
};

type FreelancerPaymentRow = ProjectPaymentRow & { freelancerName: string };
type Member = { freelancerName: string; commission: number; paid: number; owed: number };
type FreelancerSummary = { members: Member[]; totalPaid: number; totalOwed: number; payments: FreelancerPaymentRow[] };

type ProjectSummary = {
  id: number;
  projectName: string;
  clientPrice: number;
  paidAmount: number;
  remainingAmount: number;
};

type Props = {
  project: ProjectSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialTab?: "client" | "freelancers";
};

function apiBase() {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
}

const today = () => new Date().toISOString().slice(0, 10);

function MethodSelect({ value, onChange, lang }: { value: string; onChange: (v: string) => void; lang: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
      <SelectContent>
        {PAYMENT_METHODS.map((m) => (
          <SelectItem key={m.value} value={m.value}>{lang === "ar" ? m.labelAr : m.labelEn}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One place for a project's money: payments received from the client and money given to its freelancers. */
export function ProjectPaymentDialog({ project, open, onOpenChange, onSuccess, initialTab = "client" }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [tab, setTab] = useState<string>(initialTab);
  const [paid, setPaid] = useState({ paidAmount: 0, remainingAmount: 0 });

  // Client payments
  const [payments, setPayments] = useState<ProjectPaymentRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [paidAt, setPaidAt] = useState(today());
  const [nextDate, setNextDate] = useState("");

  // Freelancer payments
  const [fr, setFr] = useState<FreelancerSummary | null>(null);
  const [frName, setFrName] = useState("");
  const [frAmount, setFrAmount] = useState("");
  const [frMethod, setFrMethod] = useState<string>("bank_transfer");
  const [frDate, setFrDate] = useState(today());
  const [frNotes, setFrNotes] = useState("");

  useEffect(() => {
    if (!open || !project) return;
    setTab(initialTab);
    setPaid({ paidAmount: project.paidAmount, remainingAmount: project.remainingAmount });
    setAmount(""); setPaymentMethod("bank_transfer"); setPaidAt(today()); setNextDate("");
    setFrAmount(""); setFrMethod("bank_transfer"); setFrDate(today()); setFrNotes("");
    setLoadingHistory(true);
    fetch(`${apiBase()}/projects/${project.id}/payments`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectPaymentRow[]) => setPayments(Array.isArray(rows) ? rows : []))
      .catch(() => setPayments([]))
      .finally(() => setLoadingHistory(false));
    fetch(`${apiBase()}/projects/${project.id}/freelancer-payments`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FreelancerSummary | null) => {
        setFr(data);
        const firstOwed = data?.members.find((m) => m.owed > 0) ?? data?.members[0];
        setFrName(firstOwed?.freelancerName ?? "");
      })
      .catch(() => setFr(null));
  }, [open, project?.id]);

  const call = async (url: string, init: RequestInit) => {
    const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? t("common.error"));
    return data;
  };

  const addClientPayment = async () => {
    if (!project || !amount) return;
    setSaving(true);
    try {
      const data = await call(`${apiBase()}/projects/${project.id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), paymentMethod, paidAt: paidAt || undefined, nextPaymentDate: nextDate || undefined }),
      });
      if (Array.isArray(data.payments)) setPayments(data.payments);
      if (data.project) setPaid({ paidAmount: data.project.paidAmount, remainingAmount: data.project.remainingAmount });
      setAmount("");
      onSuccess();
      toast({ title: t("projects.paymentLogged") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteClientPayment = async (paymentId: number) => {
    if (!project || !window.confirm(t("payments.confirmDelete"))) return;
    try {
      const data = await call(`${apiBase()}/projects/${project.id}/payments/${paymentId}`, { method: "DELETE" });
      if (Array.isArray(data.payments)) setPayments(data.payments);
      if (data.project) setPaid({ paidAmount: data.project.paidAmount, remainingAmount: data.project.remainingAmount });
      onSuccess();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    }
  };

  const addFreelancerPayment = async () => {
    if (!project || !frName || !frAmount) return;
    setSaving(true);
    try {
      const data = await call(`${apiBase()}/projects/${project.id}/freelancer-payments`, {
        method: "POST",
        body: JSON.stringify({ freelancerName: frName, amount: Number(frAmount), paymentMethod: frMethod, paidAt: frDate, notes: frNotes || undefined }),
      });
      setFr(data);
      setFrAmount(""); setFrNotes("");
      onSuccess();
      toast({ title: t("payments.freelancerPaid") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteFreelancerPayment = async (paymentId: number) => {
    if (!project || !window.confirm(t("payments.confirmDelete"))) return;
    try {
      setFr(await call(`${apiBase()}/projects/${project.id}/freelancer-payments/${paymentId}`, { method: "DELETE" }));
      onSuccess();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    }
  };

  const selectedMember = fr?.members.find((m) => m.freelancerName === frName);
  const toFreelancers = fr?.totalPaid ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("payments.title")} — {project?.projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="rounded border border-border p-2">
            <div className="text-muted-foreground text-xs">{t("projects.price")}</div>
            <div className="font-semibold"><PrivacyWrapper value={project?.clientPrice ?? 0} /></div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted-foreground text-xs">{t("payments.received")}</div>
            <div className="font-semibold text-blue-400"><PrivacyWrapper value={paid.paidAmount} /></div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted-foreground text-xs">{t("payments.givenToFreelancers")}</div>
            <div className="font-semibold"><PrivacyWrapper value={toFreelancers} /></div>
          </div>
          <div className="rounded border border-green-500/30 bg-green-500/5 p-2">
            <div className="text-muted-foreground text-xs">{t("payments.fratelanzaShare")}</div>
            <div className="font-semibold text-green-500"><PrivacyWrapper value={paid.paidAmount - toFreelancers} /></div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="client" data-testid="tab-client-payments">{t("payments.fromClient")}</TabsTrigger>
            <TabsTrigger value="freelancers" data-testid="tab-freelancer-payments">{t("payments.toFreelancers")}</TabsTrigger>
          </TabsList>

          <TabsContent value="client" className="space-y-4 pt-2">
            <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm flex justify-between">
              <span className="text-muted-foreground">{t("projects.remaining")}</span>
              <span className="font-semibold text-destructive"><PrivacyWrapper value={paid.remainingAmount} /></span>
            </div>
            {loadingHistory ? (
              <div className="text-sm text-muted-foreground py-3 text-center">{t("common.loading")}</div>
            ) : payments.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 text-center">{t("projects.noPayments")}</div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden max-h-44 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-card/80 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-start">{t("projects.paymentDate")}</th>
                      <th className="px-2 py-1.5 text-start">{t("projects.paymentMethod")}</th>
                      <th className="px-2 py-1.5 text-start">{t("payments.notes")}</th>
                      <th className="px-2 py-1.5 text-end">{t("payments.amount")}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="px-2 py-1.5 text-muted-foreground">{p.paidAt ?? p.createdAt.slice(0, 10)}</td>
                        <td className="px-2 py-1.5">{paymentMethodLabel(p.paymentMethod, lang)}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{p.notes ?? ""}</td>
                        <td className="px-2 py-1.5 text-end text-blue-400"><PrivacyWrapper value={p.amount} /></td>
                        <td className="px-1"><Button size="icon" variant="ghost" className="h-6 w-6" title={t("common.delete")} onClick={() => deleteClientPayment(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("projects.amountReceived")}</Label>
                <Input data-testid="input-payment-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("projects.paymentMethod")}</Label>
                <MethodSelect value={paymentMethod} onChange={setPaymentMethod} lang={lang} />
              </div>
              <div className="space-y-1">
                <Label>{t("projects.paymentDate")}</Label>
                <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("projects.nextPaymentDate")}</Label>
                <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </div>
              <Button className="col-span-2" data-testid="button-confirm-payment" onClick={addClientPayment} disabled={saving || !amount}>
                {saving ? t("common.saving") : t("projects.confirmPayment")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="freelancers" className="space-y-4 pt-2">
            {!fr || fr.members.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 text-center">{t("payments.noFreelancers")}</div>
            ) : (
              <>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-card/80">
                      <tr>
                        <th className="px-2 py-1.5 text-start">{t("payments.freelancer")}</th>
                        <th className="px-2 py-1.5 text-end">{t("payments.commission")}</th>
                        <th className="px-2 py-1.5 text-end">{t("payments.paid")}</th>
                        <th className="px-2 py-1.5 text-end">{t("payments.owed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fr.members.map((m) => (
                        <tr key={m.freelancerName} className="border-t border-border/40">
                          <td className="px-2 py-1.5 font-medium">{m.freelancerName}</td>
                          <td className="px-2 py-1.5 text-end"><PrivacyWrapper value={m.commission} /></td>
                          <td className="px-2 py-1.5 text-end text-green-500"><PrivacyWrapper value={m.paid} /></td>
                          <td className="px-2 py-1.5 text-end text-orange-500"><PrivacyWrapper value={m.owed} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {fr.payments.length > 0 && (
                  <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-card/80 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-start">{t("projects.paymentDate")}</th>
                          <th className="px-2 py-1.5 text-start">{t("payments.freelancer")}</th>
                          <th className="px-2 py-1.5 text-start">{t("payments.notes")}</th>
                          <th className="px-2 py-1.5 text-end">{t("payments.amount")}</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {fr.payments.map((p) => (
                          <tr key={p.id} className="border-t border-border/40">
                            <td className="px-2 py-1.5 text-muted-foreground">{p.paidAt ?? p.createdAt.slice(0, 10)}</td>
                            <td className="px-2 py-1.5">{p.freelancerName}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{p.notes ?? paymentMethodLabel(p.paymentMethod, lang)}</td>
                            <td className="px-2 py-1.5 text-end"><PrivacyWrapper value={p.amount} /></td>
                            <td className="px-1"><Button size="icon" variant="ghost" className="h-6 w-6" title={t("common.delete")} onClick={() => deleteFreelancerPayment(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("payments.freelancer")}</Label>
                    <Select value={frName} onValueChange={setFrName}>
                      <SelectTrigger data-testid="select-pay-freelancer"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fr.members.map((m) => <SelectItem key={m.freelancerName} value={m.freelancerName}>{m.freelancerName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedMember && (
                      <div className="text-xs text-muted-foreground">{t("payments.stillOwed")}: <PrivacyWrapper value={selectedMember.owed} /></div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>{t("payments.amountGiven")}</Label>
                    <Input data-testid="input-freelancer-amount" type="number" value={frAmount} onChange={(e) => setFrAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("projects.paymentMethod")}</Label>
                    <MethodSelect value={frMethod} onChange={setFrMethod} lang={lang} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("projects.paymentDate")}</Label>
                    <Input type="date" value={frDate} onChange={(e) => setFrDate(e.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>{t("payments.notes")}</Label>
                    <Input value={frNotes} onChange={(e) => setFrNotes(e.target.value)} />
                  </div>
                  <Button className="col-span-2" data-testid="button-confirm-freelancer-payment" onClick={addFreelancerPayment} disabled={saving || !frAmount || !frName}>
                    {saving ? t("common.saving") : t("payments.recordFreelancerPayment")}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
