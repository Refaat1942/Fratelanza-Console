import { useTranslation } from "react-i18next";
import type { AcquisitionMetrics } from "@workspace/api-client-react";
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
  /** When given, a customer acquisition cost (CAC) calculation is shown with the others */
  acquisition?: AcquisitionMetrics;
};

function useFigures({ contractValue, collected, projectCosts, projectCostsPaid, expenses }: Props) {
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
  return { t, isPrivate, costsPaid, cashResult, finalProfit, styles, money, percent };
}

/** Plain-language verdict and the estimated profit once every client pays. */
function VerdictBody(props: Props) {
  const { totalRemaining, freelancerOwed = 0, netMarginPct, periodLabel } = props;
  const { t, isPrivate, cashResult, finalProfit, styles, money } = useFigures(props);
  return (
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
  );
}

/** The calculations behind the verdict, spelled out step by step. */
function CalculationsBody(props: Props) {
  const { contractValue, collected, projectCosts, expenses, totalRemaining, grossMarginPct, netMarginPct, lossProjects, acquisition } = props;
  const { t, isPrivate, costsPaid, cashResult, finalProfit, money, percent } = useFigures(props);
  const row = "flex justify-between gap-4";

  const Calc = ({ title, first, firstLabel, costs, costsLabel, result, resultLabel }: { title: string; first: number; firstLabel: string; costs: number; costsLabel: string; result: number; resultLabel: string }) => (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm min-w-0">
      <div className="text-xs font-semibold text-muted-foreground mb-2">{title}</div>
      <div className={row}><span>{firstLabel}</span>{money(first)}</div>
      <div className={`${row} text-muted-foreground`}><span>{costsLabel}</span>{money(-costs)}</div>
      <div className={`${row} border-t border-border/60 mt-1 pt-1 font-semibold`}><span>{t("dashboard.calcShare")}</span>{money(first - costs)}</div>
      <div className={`${row} text-muted-foreground`}><span>{t("dashboard.calcExpenses")}</span>{money(-expenses)}</div>
      <div className={`${row} border-t border-border mt-1 pt-1 font-bold`}><span>{resultLabel}</span>{money(result, true)}</div>
    </div>
  );

  const count = (n: number) => <span className="whitespace-nowrap shrink-0 tabular-nums">{isPrivate ? "***" : n.toLocaleString()}</span>;
  const times = (v: number) => (isPrivate ? "***" : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`);
  const ratioColor = (v: number) => (v >= 3 ? "text-green-500" : v >= 1 ? "text-yellow-500" : "text-red-500");

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 md:grid-cols-2 ${acquisition ? "xl:grid-cols-3" : ""} gap-3`}>
        <Calc title={t("dashboard.calcCashTitle")} first={collected} firstLabel={t("dashboard.calcReceived")} costs={costsPaid} costsLabel={t("dashboard.calcCostsPaid")} result={cashResult} resultLabel={t("dashboard.calcCashResult")} />
        <Calc title={t("dashboard.calcFinalTitle")} first={contractValue} firstLabel={t("dashboard.calcDeals")} costs={projectCosts} costsLabel={t("dashboard.calcCosts")} result={finalProfit} resultLabel={t("dashboard.calcFinalResult")} />
        {acquisition && (
          <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm min-w-0" data-testid="calc-cac">
            <div className="text-xs font-semibold text-muted-foreground mb-2">{t("dashboard.calcCacTitle")}</div>
            <div className={row}><span>{t("dashboard.calcMarketing")}</span>{money(acquisition.marketingSpend)}</div>
            <div className={`${row} text-muted-foreground`}><span>{t("dashboard.calcSales")}</span>{money(acquisition.salesSpend)}</div>
            <div className={`${row} border-t border-border/60 mt-1 pt-1 font-semibold`}><span>{t("dashboard.calcAcqSpend")}</span>{money(acquisition.acquisitionSpend)}</div>
            <div className={`${row} text-muted-foreground`}><span>{t("dashboard.calcNewClients")}</span>{count(acquisition.newClients)}</div>
            <div className={`${row} border-t border-border mt-1 pt-1 font-bold`}><span>{t("dashboard.calcCac")}</span>{acquisition.newClients ? money(acquisition.cac) : <span>—</span>}</div>
            {acquisition.newClients > 0 && (
              <>
                <div className={`${row} text-muted-foreground mt-2`}><span>{t("dashboard.calcAvgDeal")}</span>{money(acquisition.avgDealPerNewClient)}</div>
                <div className={`${row} text-muted-foreground`}><span>{t("dashboard.calcAvgProfit")}</span>{money(acquisition.avgProfitPerNewClient)}</div>
                {acquisition.cac > 0 && (
                  <div className={`${row} font-semibold`}>
                    <span>{t("dashboard.calcProfitToCac")}</span>
                    <span className={`whitespace-nowrap tabular-nums ${ratioColor(acquisition.profitToCac)}`}>{times(acquisition.profitToCac)}</span>
                  </div>
                )}
                {acquisition.cac > 0 && <div className="text-xs text-muted-foreground mt-1">{t("dashboard.calcCacPct", { pct: percent(acquisition.cacPctOfDeal) })}</div>}
              </>
            )}
            {acquisition.acquisitionSpend === 0 && <p className="text-xs text-muted-foreground mt-2">{t("dashboard.cacNoSpend")}</p>}
            {acquisition.acquisitionSpend > 0 && acquisition.newClients === 0 && <p className="text-xs text-muted-foreground mt-2">{t("dashboard.cacNoClients")}</p>}
          </div>
        )}
      </div>
      <div className="text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
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
  );
}

export function FinancialVerdict(props: Props) {
  const { styles } = useFigures(props);
  return (
    <Card className={`border ${styles.box}`} data-testid="financial-health">
      <CardContent className="p-4"><VerdictBody {...props} /></CardContent>
    </Card>
  );
}

export function FinancialCalculations(props: Props) {
  return <CalculationsBody {...props} />;
}

/** Verdict and calculations together in one box. */
export function FinancialHealth(props: Props) {
  const { styles } = useFigures(props);
  return (
    <Card className={`border ${styles.box}`} data-testid="financial-health">
      <CardContent className="p-4 space-y-3">
        <VerdictBody {...props} />
        <CalculationsBody {...props} />
      </CardContent>
    </Card>
  );
}
