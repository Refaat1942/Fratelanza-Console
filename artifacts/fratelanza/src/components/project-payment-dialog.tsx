import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-methods";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export type ProjectPaymentRow = {
  id: number;
  amount: number;
  paymentMethod: string;
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
};

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
};

function apiBase() {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
}

export function ProjectPaymentDialog({ project, open, onOpenChange, onSuccess }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [payments, setPayments] = useState<ProjectPaymentRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [nextDate, setNextDate] = useState("");

  useEffect(() => {
    if (!open || !project) return;
    setAmount("");
    setPaymentMethod("bank_transfer");
    setPaidAt(new Date().toISOString().slice(0, 10));
    setNextDate("");
    setLoadingHistory(true);
    fetch(`${apiBase()}/projects/${project.id}/payments`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectPaymentRow[]) => setPayments(Array.isArray(rows) ? rows : []))
      .catch(() => setPayments([]))
      .finally(() => setLoadingHistory(false));
  }, [open, project?.id]);

  const handleSubmit = async () => {
    if (!project || !amount) return;
    setSaving(true);
    try {
      const r = await fetch(`${apiBase()}/projects/${project.id}/payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          paymentMethod,
          paidAt: paidAt || undefined,
          nextPaymentDate: nextDate || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Payment failed");
      if (Array.isArray(data.payments)) setPayments(data.payments);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const historyTotal = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("projects.logPayment")} — {project?.projectName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">{t("projects.price")}</div>
              <div className="font-semibold"><PrivacyWrapper value={project?.clientPrice ?? 0} /></div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-muted-foreground text-xs">{t("projects.alreadyPaid")}</div>
              <div className="font-semibold text-blue-400"><PrivacyWrapper value={project?.paidAmount ?? 0} /></div>
            </div>
            <div className="col-span-2 rounded border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-muted-foreground text-xs">{t("projects.remaining")}</div>
              <div className="font-semibold text-destructive"><PrivacyWrapper value={project?.remainingAmount ?? 0} /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t("projects.paymentHistory")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("projects.paymentTotal")}: <PrivacyWrapper value={historyTotal} />
              </span>
            </div>
            {loadingHistory ? (
              <div className="text-sm text-muted-foreground py-3 text-center">{t("common.loading")}</div>
            ) : payments.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 text-center">{t("projects.noPayments")}</div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-card/80 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{t("projects.paymentDate")}</th>
                      <th className="px-2 py-1.5 text-left">{t("projects.paymentMethod")}</th>
                      <th className="px-2 py-1.5 text-right">{t("projects.paid")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="px-2 py-1.5 text-muted-foreground">{p.paidAt ?? p.createdAt.slice(0, 10)}</td>
                        <td className="px-2 py-1.5">{paymentMethodLabel(p.paymentMethod, lang)}</td>
                        <td className="px-2 py-1.5 text-right text-blue-400"><PrivacyWrapper value={p.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div className="space-y-1">
              <Label>{t("projects.amountReceived")}</Label>
              <Input data-testid="input-payment-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("projects.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {lang === "ar" ? m.labelAr : m.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("projects.paymentDate")}</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("projects.nextPaymentDate")}</Label>
              <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button data-testid="button-confirm-payment" onClick={handleSubmit} disabled={saving || !amount}>
            {saving ? t("common.saving") : t("projects.confirmPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
