import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { usePrivacy } from "@/lib/privacy-context";
import { CheckCircle2, Hourglass, AlertTriangle } from "lucide-react";

type Props = {
  expectedNetProfit: number;
  cashNetProfit: number;
  totalRemaining: number;
  grossMarginPct: number;
  netMarginPct: number;
  lossProjects?: number;
};

/** Plain-language verdict: is the business making or losing money? */
export function FinancialHealth({ expectedNetProfit, cashNetProfit, totalRemaining, grossMarginPct, netMarginPct, lossProjects }: Props) {
  const { t } = useTranslation();
  const { isPrivate } = usePrivacy();

  const state = expectedNetProfit < 0 ? "loss" : cashNetProfit < 0 ? "pending" : "profit";
  const styles = {
    profit: { box: "border-green-500/40 bg-green-500/10", text: "text-green-400", Icon: CheckCircle2, title: t("dashboard.healthProfit"), desc: t("dashboard.healthProfitDesc") },
    pending: { box: "border-yellow-500/40 bg-yellow-500/10", text: "text-yellow-400", Icon: Hourglass, title: t("dashboard.healthPending"), desc: t("dashboard.healthPendingDesc") },
    loss: { box: "border-red-500/40 bg-red-500/10", text: "text-red-400", Icon: AlertTriangle, title: t("dashboard.healthLoss"), desc: t("dashboard.healthLossDesc") },
  }[state];

  const signed = (v: number) => (
    <span className={v < 0 ? "text-red-400" : "text-green-400"}>
      {v < 0 ? "- " : ""}<PrivacyWrapper value={Math.abs(v)} />
    </span>
  );
  const percent = (v: number) => (isPrivate ? "***" : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`);

  return (
    <Card className={`border ${styles.box}`} data-testid="financial-health">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <styles.Icon className={`h-6 w-6 shrink-0 ${styles.text}`} />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("dashboard.healthTitle")}</div>
            <div className={`text-lg font-bold ${styles.text}`}>{styles.title}</div>
            <p className="text-sm text-muted-foreground">{styles.desc}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm shrink-0">
          <span className="text-muted-foreground">{t("dashboard.expectedNetProfit")}</span>
          <span className="font-semibold md:col-span-2">{signed(expectedNetProfit)}</span>
          <span className="text-muted-foreground">{t("dashboard.cashNetProfit")}</span>
          <span className="font-semibold md:col-span-2">{signed(cashNetProfit)}</span>
          <span className="text-muted-foreground">{t("dashboard.totalRemaining")}</span>
          <span className="font-semibold text-orange-400 md:col-span-2"><PrivacyWrapper value={totalRemaining} /></span>
          <span className="text-muted-foreground">{t("dashboard.grossMarginPct")} / {t("dashboard.netMarginPct")}</span>
          <span className="font-semibold md:col-span-2">{percent(grossMarginPct)} / {percent(netMarginPct)}</span>
          {lossProjects !== undefined && (
            <>
              <span className="text-muted-foreground">{t("dashboard.lossProjects")}</span>
              <span className={`font-semibold md:col-span-2 ${lossProjects > 0 ? "text-red-400" : ""}`}>{lossProjects}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
