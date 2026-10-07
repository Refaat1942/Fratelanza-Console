import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetProfitByType, useGetPaymentAlerts, getGetDashboardSummaryQueryKey, getGetProfitByTypeQueryKey } from '@workspace/api-client-react';
import { PeriodPicker, usePeriod, usePeriodLabel } from "@/components/period-picker";
import { PrivacyWrapper } from '@/components/privacy-wrapper';
import { MotionCard } from "@/components/page-transition";
import { AnimatedNumber } from "@/components/animated-number";
import { usePrivacy } from "@/lib/privacy-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Wallet, Clock, Activity, ReceiptText, Users, UserPlus, Target, Scale } from "lucide-react";
import { FinancialVerdict, FinancialCalculations } from "@/components/financial-health";

function Kpi({ label, value, icon: Icon, color, delay, negative, valueColor, note, format = "money" }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; delay: number; negative?: boolean; valueColor?: string; note?: string; format?: "money" | "count" | "times" }) {
  const { isPrivate } = usePrivacy();
  const displayValue = negative ? -Math.abs(value) : value;
  return (
    <MotionCard delay={delay} className="h-full">
      <Card className="h-full bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-colors overflow-hidden relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
          <div className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="@container">
          <div className={`text-[clamp(0.9rem,12cqi,1.5rem)] leading-tight font-bold tabular-nums whitespace-nowrap ${valueColor ?? "text-foreground"}`}>
            {isPrivate ? <span>***</span> : format === "count" ? (
              <AnimatedNumber value={value} format={(n) => Math.round(n).toLocaleString()} />
            ) : format === "times" ? (
              <span>{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}×</span>
            ) : (
              <span>{displayValue < 0 ? "- " : ""}<span className="text-[0.65em] font-semibold">EGP</span> <AnimatedNumber value={Math.abs(displayValue)} format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })} /></span>
            )}
          </div>
          {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
        </CardContent>
      </Card>
    </MotionCard>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { period, setPeriod, params } = usePeriod();
  const periodLabel = usePeriodLabel(period);
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary(params, { query: { queryKey: getGetDashboardSummaryQueryKey(params) } });
  const { data: profitByType, isLoading: loadingProfit } = useGetProfitByType(params, { query: { queryKey: getGetProfitByTypeQueryKey(params) } });
  const { data: alerts, isLoading: loadingAlerts } = useGetPaymentAlerts();
  const { isPrivate } = usePrivacy();
  const fmt = (v?: number) => (isPrivate ? "***" : `EGP ${Math.round(v ?? 0).toLocaleString()}`);
  const costsNote = t('dashboard.kpiCostsNote2', { paid: fmt(summary?.totalCostPaid), owed: fmt(summary?.freelancerOwed) });
  const dealsPct = (v?: number) => {
    const total = summary?.totalContractValue ?? 0;
    return total > 0 ? Math.round(((v ?? 0) / total) * 100) : 0;
  };
  const acq = summary?.acquisition;
  const healthProps = summary && {
    contractValue: summary.totalContractValue ?? 0,
    collected: summary.totalPaid,
    projectCosts: summary.totalCost ?? 0,
    projectCostsPaid: summary.totalCostPaid,
    freelancerOwed: summary.freelancerOwed ?? 0,
    expenses: summary.totalExpenses,
    totalRemaining: summary.totalRemaining,
    grossMarginPct: summary.grossMarginPct ?? 0,
    netMarginPct: summary.netMarginPct ?? 0,
    lossProjects: summary.lossProjects,
    periodLabel,
    acquisition: acq,
  };
  const cacNote = !acq ? undefined
    : acq.acquisitionSpend === 0 ? t('dashboard.cacNoSpendShort')
    : acq.newClients === 0 ? t('dashboard.cacNoClientsShort')
    : t('dashboard.kpiCacNote', { spend: fmt(acq.acquisitionSpend), n: acq.newClients });
  const profitToCacColor = !acq || acq.cac <= 0 ? "text-muted-foreground" : acq.profitToCac >= 3 ? "text-green-400" : acq.profitToCac >= 1 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('dashboard.intro')}</p>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      {healthProps && (
        <MotionCard delay={0}>
          <FinancialVerdict {...healthProps} />
        </MotionCard>
      )}

      <Section title={t('dashboard.sectionMoneyIn')} hint={t('dashboard.sectionMoneyInHint')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi label={t('dashboard.kpiContract')} note={t('dashboard.kpiContractNote')} value={summary?.totalContractValue ?? 0} icon={TrendingUp} color="bg-blue-500/10 text-blue-400" delay={0} />
          <Kpi label={t('dashboard.kpiPaid')} note={`${t('dashboard.kpiPaidNote')} · ${t('dashboard.ofDeals', { pct: dealsPct(summary?.totalPaid) })}`} value={summary?.totalPaid ?? 0} icon={Wallet} color="bg-green-500/10 text-green-400" delay={0.05} />
          <Kpi label={t('dashboard.kpiRemaining')} note={`${t('dashboard.kpiRemainingNote')} · ${t('dashboard.ofDeals', { pct: dealsPct(summary?.totalRemaining) })}`} value={summary?.totalRemaining ?? 0} icon={Clock} color="bg-orange-500/10 text-orange-400" delay={0.1} />
        </div>
      </Section>

      <Section title={t('dashboard.sectionMoneyOut')} hint={t('dashboard.sectionMoneyOutHint')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi label={t('dashboard.kpiCosts')} note={costsNote} value={summary?.totalCost ?? 0} icon={Users} color="bg-muted text-muted-foreground" delay={0.12} negative valueColor="text-red-400" />
          <Kpi label={t('dashboard.kpiExpenses')} note={t('dashboard.kpiExpensesNote')} value={summary?.totalExpenses ?? 0} icon={ReceiptText} color="bg-red-500/10 text-red-400" delay={0.15} negative valueColor="text-red-400" />
          <Kpi label={t('dashboard.kpiCash')} note={t('dashboard.kpiCashNote2')} value={summary?.totalNetProfit ?? 0} icon={Activity} color="bg-primary/10 text-primary" delay={0.2} valueColor={(summary?.totalNetProfit ?? 0) >= 0 ? "text-primary" : "text-red-400"} />
        </div>
      </Section>

      <Section title={t('dashboard.sectionAcquisition')} hint={t('dashboard.sectionAcquisitionHint')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi label={t('dashboard.kpiNewClients')} note={t('dashboard.kpiNewClientsNote')} value={acq?.newClients ?? 0} format="count" icon={UserPlus} color="bg-sky-500/10 text-sky-400" delay={0.22} />
          <Kpi label={t('dashboard.kpiCac')} note={cacNote} value={acq?.cac ?? 0} icon={Target} color="bg-purple-500/10 text-purple-400" delay={0.24} />
          <Kpi label={t('dashboard.kpiProfitToCac')} note={t('dashboard.kpiProfitToCacNote')} value={acq?.profitToCac ?? 0} format="times" icon={Scale} color="bg-emerald-500/10 text-emerald-400" delay={0.26} valueColor={profitToCacColor} />
        </div>
      </Section>

      {healthProps && (
        <Section title={t('dashboard.sectionCalculations')} hint={t('dashboard.sectionCalculationsHint')}>
          <MotionCard delay={0.28}>
            <Card className="bg-card/60 backdrop-blur border-border/60">
              <CardContent className="p-4">
                <FinancialCalculations {...healthProps} />
              </CardContent>
            </Card>
          </MotionCard>
        </Section>
      )}

      <Section title={t('dashboard.sectionCollections')} hint={t('dashboard.sectionCollectionsHint')}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <MotionCard delay={0.3} className="lg:col-span-2">
            <Card className="h-full bg-card/60 backdrop-blur">
              <CardHeader>
                <CardTitle>{t('dashboard.remainingBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : (summary?.remainingBreakdown ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t('dashboard.noRemaining')}</div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border/60">
                    <table className="w-full text-sm">
                      <thead className="bg-card/80 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start">{t('dashboard.colProject')}</th>
                          <th className="px-3 py-2 text-start">{t('dashboard.colClient')}</th>
                          <th className="px-3 py-2 text-end">{t('dashboard.colRemaining')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(summary?.remainingBreakdown ?? []).map((row, i) => (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + i * 0.03 }}
                            className="border-t border-border/40 hover:bg-card/40"
                          >
                            <td className="px-3 py-2 font-medium">{row.projectName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.clientName || "—"}</td>
                            <td className="px-3 py-2 text-end font-semibold text-orange-400">
                              <PrivacyWrapper value={row.remaining} />
                            </td>
                          </motion.tr>
                        ))}
                        <tr className="border-t-2 border-border bg-card/60">
                          <td className="px-3 py-2 font-bold" colSpan={2}>{t('dashboard.colTotal')}</td>
                          <td className="px-3 py-2 text-end font-bold text-orange-400">
                            <PrivacyWrapper value={summary?.totalRemaining ?? 0} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </MotionCard>
          <MotionCard delay={0.32}>
            <Card className="h-full bg-card/60 backdrop-blur">
              <CardHeader>
                <CardTitle>{t('dashboard.paymentAlerts')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {loadingAlerts ? (
                    <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
                  ) : alerts?.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('dashboard.noAlerts')}</div>
                  ) : (
                    alerts?.map((alert, i) => (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.05 }}
                        className="flex justify-between items-center p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                      >
                        <div>
                          <div className="font-medium text-sm">{alert.projectName}</div>
                          <div className="text-xs text-muted-foreground">{alert.clientName}</div>
                        </div>
                        <div className="text-end">
                          <div className="font-bold text-destructive">
                            <PrivacyWrapper value={alert.remaining} />
                          </div>
                          <div className="text-xs text-muted-foreground">{alert.nextPaymentDate}</div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </MotionCard>
        </div>
      </Section>

      <Section title={t('dashboard.sectionProjects')}>
        <MotionCard delay={0.35}>
          <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
              <CardTitle>{t('dashboard.profitByType')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('dashboard.profitByTypeNote')}</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {!loadingProfit && profitByType && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitByType}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar dataKey="netProfit" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} animationDuration={800} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </MotionCard>
      </Section>
    </div>
  );
}
