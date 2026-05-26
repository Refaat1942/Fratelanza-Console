import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetProfitByType, useGetPaymentAlerts } from '@workspace/api-client-react';
import { PrivacyWrapper } from '@/components/privacy-wrapper';
import { MotionCard } from "@/components/page-transition";
import { AnimatedNumber } from "@/components/animated-number";
import { usePrivacy } from "@/lib/privacy-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Wallet, Clock, Activity, ReceiptText } from "lucide-react";

function Kpi({ label, value, icon: Icon, color, delay, negative, valueColor }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; delay: number; negative?: boolean; valueColor?: string }) {
  const { isPrivate } = usePrivacy();
  const displayValue = negative ? -Math.abs(value) : value;
  return (
    <MotionCard delay={delay}>
      <Card className="bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-colors overflow-hidden relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${valueColor ?? "text-foreground"}`}>
            {isPrivate ? <span>***</span> : (
              <span>{displayValue < 0 ? "- " : ""}EGP <AnimatedNumber value={Math.abs(displayValue)} format={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })} /></span>
            )}
          </div>
        </CardContent>
      </Card>
    </MotionCard>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: profitByType, isLoading: loadingProfit } = useGetProfitByType();
  const { data: alerts, isLoading: loadingAlerts } = useGetPaymentAlerts();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label={t('dashboard.totalRevenue')} value={summary?.totalRevenue ?? 0} icon={TrendingUp} color="bg-blue-500/10 text-blue-400" delay={0} />
        <Kpi label={t('dashboard.totalPaid')} value={summary?.totalPaid ?? 0} icon={Wallet} color="bg-green-500/10 text-green-400" delay={0.05} />
        <Kpi label={t('dashboard.totalRemaining')} value={summary?.totalRemaining ?? 0} icon={Clock} color="bg-orange-500/10 text-orange-400" delay={0.1} />
        <Kpi label={t('dashboard.totalExpenses')} value={summary?.totalExpenses ?? 0} icon={ReceiptText} color="bg-red-500/10 text-red-400" delay={0.15} negative valueColor="text-red-400" />
        <Kpi label={t('dashboard.netProfit')} value={summary?.totalNetProfit ?? 0} icon={Activity} color="bg-primary/10 text-primary" delay={0.2} valueColor={(summary?.totalNetProfit ?? 0) >= 0 ? "text-primary" : "text-red-400"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MotionCard delay={0.25} className="lg:col-span-2">
          <Card className="bg-card/60 backdrop-blur">
            <CardHeader>
              <CardTitle>{t('dashboard.profitByType')}</CardTitle>
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

        <MotionCard delay={0.3}>
          <Card className="bg-card/60 backdrop-blur">
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
                      <div className="text-right">
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

      <MotionCard delay={0.35}>
        <Card className="bg-card/60 backdrop-blur">
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
                      <th className="px-3 py-2 text-left">Project</th>
                      <th className="px-3 py-2 text-left">Client</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
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
                        <td className="px-3 py-2 text-right font-semibold text-orange-400">
                          <PrivacyWrapper value={row.remaining} />
                        </td>
                      </motion.tr>
                    ))}
                    <tr className="border-t-2 border-border bg-card/60">
                      <td className="px-3 py-2 font-bold" colSpan={2}>Total</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-400">
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
    </div>
  );
}
