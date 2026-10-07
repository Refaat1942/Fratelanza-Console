import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { usePrivacy } from "@/lib/privacy-context";
import { CheckCircle2, Hourglass, AlertTriangle } from "lucide-react";

type Props = {
  contractValue: number;
  collected: number;
  projectCosts: number;
  /** Part of projectCosts actually paid out so far (freelancers paid + other costs) */
  projectCostsPaid?: number;
  freelancerOwed?: number;
  expenses: number;
  totalRemaining: number;
  grossMarginPct: number;
  netMarginPct: number;
  lossProjects?: number;
  periodLabel?: string;
};

/** Plain-language verdict with the two calculations spelled out step by step. */
export function FinancialHealth({ contractValue, collected, projectCosts, projectCostsPaid, freelancerOwed = 0, expenses, totalRemaining, grossMarginPct, netMarginPct, lossProjects, periodLabel }: Props) {
  const { t } = useTranslation();
  const { isPrivate } = usePrivacy();

  const costsPaid = projectCostsPaid ?? projectCosts;
  const cashResult = collected - costsPaid - expenses;
  const finalProfit = contractValue - projectCosts - expenses;
  const state = finalProfit < 0 ? "loss" : cashResult < 0 ? "pending" : "profit";
  const styles = {
    profit: { box: "border-green-500/40 bg-green-500/10", text: "text-green-500", Icon: CheckCircle2, title: t("dashboard.healthProfit"), desc: t("dashboard.healthProfitDesc") },
    pending: { box: "border-yellow-500/40 bg-yellow-500/10", text: "text-yellow-500", Icon: Hourglass, title: t("dashboard.healthPending"), desc: t("dashboard.healthPendingDesc") },
    loss: { box: "border-red-500/40 bg-red-500/10", text: "text-red-500", Icon: AlertTriangle, title: t("dashboard.healthLoss"), desc: t("dashboard.healthLossDesc") },
  }[state];

  const money = (v: number, sign = false) => (
    <span className={`whitespace-nowrap shrink-0 tabular-nums ${sign ? (v < 0 ? "text-red-500" : "text-green-500") : ""}`}>
      {v < 0 ? "- " : ""}<PrivacyWrapper value={Math.abs(v)} />
    </span>
  );
  const percent = (v: number) => (isPrivate ? "***" : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`);

  const Calc = ({ title, first, firstLabel, costs, costsLabel, result, resultLabel }: { title: string; first: number; firstLabel: string; costs: number; costsLabel: string; result: number; resultLabel: string }) => (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm min-w-[260px]">
      <div className="text-xs font-semibold text-muted-foreground mb-2">{title}</div>
      <div className="flex justify-between gap-4"><span>{firstLabel}</span>{money(first)}</div>
      <div className="flex justify-between gap-4 text-muted-foreground"><span>{costsLabel}</span>{money(-costs)}</div>
      <div className="flex justify-between gap-4 border-t border-border/60 mt-1 pt-1 font-semibold"><span>{t("dashboard.calcShare")}</span>{money(first - costs)}</div>
      <div className="flex justify-between gap-4 text-muted-foreground"><span>{t("dashboard.calcExpenses")}</span>{money(-expenses)}</div>
      <div className="flex justify-between gap-4 border-t border-border mt-1 pt-1 font-bold"><span>{resultLabel}</span>{money(result, true)}</div>
    </div>
  );

  return (
    <Card className={`border ${styles.box}`} data-testid="financial-health">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <styles.Icon className={`h-6 w-6 shrink-0 ${styles.text}`} />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("dashboard.healthTitle")}{periodLabel ? ` · ${periodLabel}` : ""}
              </div>
              <div className={`text-lg font-bold ${styles.text}`}>{styles.title}</div>
              <p className="text-sm text-muted-foreground">{styles.desc}</p>
            </div>
          </div>
          <div className="rounded-lg border-2 border-primary/40 bg-background/70 p-3 lg:min-w-[340px]" data-testid="estimated-profit">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("dashboard.estProfit")}</div>
            <div className={`text-3xl font-extrabold whitespace-nowrap ${finalProfit < 0 ? "text-red-500" : "text-green-500"}`}>
              {finalProfit < 0 ? "- " : ""}{isPrivate ? "***" : `EGP ${Math.round(Math.abs(finalProfit)).toLocaleString()}`}
            </div>
            <div className="text-xs text-muted-foreground">{t("dashboard.estProfitMargin", { pct: isPrivate ? "***" : netMarginPct.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
              <span className="text-muted-foreground">{t("dashboard.estProfitCollected")}</span>
              <span className="text-end font-semibold">{money(cashResult, true)}</span>
              <span className="text-muted-foreground">{t("dashboard.estProfitToCollect")}</span>
              <span className="text-end font-semibold text-orange-500"><PrivacyWrapper value={totalRemaining} /></span>
              <span className="text-muted-foreground">{t("dashboard.freelancerOwed")}</span>
              <span className="text-end font-semibold text-red-500">- <PrivacyWrapper value={freelancerOwed} /></span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t("dashboard.estProfitNote")}</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <Calc title={t("dashboard.calcCashTitle")} first={collected} firstLabel={t("dashboard.calcReceived")} costs={costsPaid} costsLabel={t("dashboard.calcCostsPaid")} result={cashResult} resultLabel={t("dashboard.calcCashResult")} />
          <Calc title={t("dashboard.calcFinalTitle")} first={contractValue} firstLabel={t("dashboard.calcDeals")} costs={projectCosts} costsLabel={t("dashboard.calcCosts")} result={finalProfit} resultLabel={t("dashboard.calcFinalResult")} />
          <div className="text-sm space-y-1 md:self-center">
            {totalRemaining > 0 && (
              <p className="text-orange-500 font-medium">
                {t("dashboard.calcCollectHint", { amount: isPrivate ? "***" : `EGP ${Math.round(totalRemaining).toLocaleString()}` })}
              </p>
            )}
            <p className="text-muted-foreground">{t("dashboard.grossMarginPct")}: <b className="text-foreground">{percent(grossMarginPct)}</b> · {t("dashboard.netMarginPct")}: <b className="text-foreground">{percent(netMarginPct)}</b></p>
            {lossProjects !== undefined && (
              <p className="text-muted-foreground">{t("dashboard.lossProjects")}: <b className={lossProjects > 0 ? "text-red-500" : "text-foreground"}>{lossProjects}</b></p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
