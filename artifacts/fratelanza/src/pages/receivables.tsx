import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListReceivables, getListReceivablesQueryKey, getListProjectsQueryKey, useLogPayment } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";

type Project = { id: number; projectName: string; clientName?: string | null; clientPrice: number; paidAmount: number; remainingAmount: number; nextPaymentDate?: string | null; status: string; };

export default function Receivables() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: receivables = [], isLoading } = useListReceivables();
  const logPayment = useLogPayment();
  const [payProj, setPayProj] = useState<Project | null>(null);
  const [amount, setAmount] = useState("");
  const [nextDate, setNextDate] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
    qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const handlePay = () => {
    if (!payProj) return;
    logPayment.mutate({ id: payProj.id, data: { amount: Number(amount), nextPaymentDate: nextDate || undefined } } as Parameters<typeof logPayment.mutate>[0], {
      onSuccess: () => { invalidate(); setPayProj(null); setAmount(""); toast({ title: "Payment logged" }); },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  };

  const now = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('receivables.title')}</h1>
        <div className="text-sm text-muted-foreground">{t('receivables.totalOutstanding')}</div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {["Client", "Project", "Total Price", "Paid", "Remaining", "Next Payment Date", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(receivables as Project[]).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('receivables.noReceivables')}</td></tr>
              ) : (receivables as Project[]).map((p) => {
                const overdue = p.nextPaymentDate && p.nextPaymentDate < now;
                return (
                  <tr key={p.id} data-testid={`row-receivable-${p.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.clientName ?? "—"}</td>
                    <td className="px-4 py-3">{p.projectName}</td>
                    <td className="px-4 py-3"><PrivacyWrapper value={p.clientPrice} /></td>
                    <td className="px-4 py-3 text-blue-400"><PrivacyWrapper value={p.paidAmount} /></td>
                    <td className="px-4 py-3 text-red-400 font-semibold"><PrivacyWrapper value={p.remainingAmount} /></td>
                    <td className="px-4 py-3">
                      {p.nextPaymentDate ? (
                        <span className={overdue ? "text-red-400 font-semibold" : "text-muted-foreground"}>
                          {p.nextPaymentDate}{overdue ? " (Overdue)" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" data-testid={`button-log-payment-${p.id}`} className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => { setPayProj(p); setAmount(""); setNextDate(""); }}>
                        <DollarSign className="h-3 w-3 me-1" /> {t('receivables.logPayment')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!payProj} onOpenChange={(v) => !v && setPayProj(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('receivables.logPayment')} — {payProj?.projectName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">Remaining: <span className="text-red-400 font-semibold ml-1"><PrivacyWrapper value={payProj?.remainingAmount ?? 0} /></span></div>
            <div className="space-y-1">
              <Label>Payment Amount (EGP)</Label>
              <Input data-testid="input-payment-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount received" />
            </div>
            <div className="space-y-1">
              <Label>Next Payment Date (optional)</Label>
              <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayProj(null)}>{t('common.cancel')}</Button>
            <Button data-testid="button-confirm-payment" disabled={!amount || logPayment.isPending} onClick={handlePay}>
              {logPayment.isPending ? t('common.saving') : t('projects.confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
