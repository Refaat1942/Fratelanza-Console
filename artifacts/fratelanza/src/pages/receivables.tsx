import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListReceivables, getListReceivablesQueryKey, getListProjectsQueryKey } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { ProjectPaymentDialog } from "@/components/project-payment-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";

type Project = { id: number; projectName: string; clientName?: string | null; clientPrice: number; paidAmount: number; remainingAmount: number; nextPaymentDate?: string | null; status: string; };

export default function Receivables() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: receivables = [], isLoading } = useListReceivables();
  const [payProj, setPayProj] = useState<Project | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListReceivablesQueryKey() });
    qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };

  const now = new Date().toISOString().slice(0, 10);
  const totalOutstanding = (receivables as Project[]).reduce((s, p) => s + Number(p.remainingAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('receivables.title')}</h1>
        <div className="text-sm text-muted-foreground">
          {t('receivables.totalOutstanding')}: <span className="text-red-400 font-semibold"><PrivacyWrapper value={totalOutstanding} /></span>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                {[t('receivables.client'), t('receivables.project'), t('receivables.totalPrice'), t('receivables.paid'), t('receivables.remaining'), t('receivables.nextDue'), ""].map((h) => (
                  <th key={h || "actions"} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
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
                          {p.nextPaymentDate}{overdue ? ` (${t('receivables.overdue')})` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" data-testid={`button-log-payment-${p.id}`} className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => setPayProj(p)}>
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

      <ProjectPaymentDialog
        project={payProj}
        open={!!payProj}
        onOpenChange={(v) => !v && setPayProj(null)}
        onSuccess={() => { invalidate(); toast({ title: t('projects.paymentLogged') }); }}
      />
    </div>
  );
}
