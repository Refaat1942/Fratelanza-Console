import { useState } from "react";
import { useGetFinanceReport, getGetFinanceReportQueryKey } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTranslation } from "react-i18next";

type Project = {
  id: number; type: string; projectName: string; clientName?: string | null;
  clientPrice: number; totalCost: number; netProfit: number;
  paidAmount: number; remainingAmount: number; status: string; date: string;
};

type RemainingItem = { id: number; projectName: string; clientName: string; remaining: number };

export default function Finance() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [applied, setApplied] = useState({ startDate: "", endDate: "" });

  const params = { startDate: applied.startDate || undefined, endDate: applied.endDate || undefined };
  const { data: report, isLoading } = useGetFinanceReport(params, { query: { queryKey: getGetFinanceReportQueryKey(params) } });

  const applyFilter = () => setApplied({ startDate, endDate });
  const clearFilter = () => { setStartDate(""); setEndDate(""); setApplied({ startDate: "", endDate: "" }); };

  type FinanceKpi = {
    label: string;
    value: number;
    color: string;
    forceNegative?: boolean;
    useSign?: boolean;
    hint?: string;
  };

  const kpis: FinanceKpi[] = report ? [
    { label: t("finance.contractValue", { defaultValue: "Contract Value" }), value: report.totalContractValue ?? 0, color: "text-foreground", hint: "Total signed project value" },
    { label: "Cash Collected", value: report.totalPaid, color: "text-blue-400", hint: "Payments received" },
    { label: "Remaining", value: report.totalRemaining, color: "text-orange-400", hint: "Outstanding receivables" },
    { label: "Project Cost", value: report.totalCost, color: "text-muted-foreground", forceNegative: true, hint: "Freelancer + direct costs" },
    { label: "Expenses", value: report.totalExpenses, color: "text-red-400", forceNegative: true, hint: "Operating expenses" },
    { label: t("finance.grossMargin", { defaultValue: "Gross Margin" }), value: report.grossMargin ?? 0, color: (report.grossMargin ?? 0) >= 0 ? "text-green-400" : "text-red-400", useSign: true, hint: "Project profit minus expenses" },
    { label: t("finance.cashNetProfit", { defaultValue: "Cash Net Profit" }), value: report.totalNetProfit, color: (report.totalNetProfit ?? 0) >= 0 ? "text-primary" : "text-red-400", useSign: true, hint: "Paid − costs − expenses" },
  ] : [];

  const formatKpiValue = (value: number, opts?: { forceNegative?: boolean; useSign?: boolean }) => {
    let displayValue = value;
    if (opts?.forceNegative) displayValue = -Math.abs(value);
    else if (!opts?.useSign) displayValue = Math.abs(value);

    return (
      <>
        {displayValue < 0 ? <span>- </span> : null}
        <PrivacyWrapper value={Math.abs(displayValue)} />
      </>
    );
  };

  const chartData = report?.projects
    ? Object.entries(
        (report.projects as Project[]).reduce((acc: Record<string, { paid: number; cost: number; cashNet: number }>, p) => {
          const month = p.date.slice(0, 7);
          const entry = acc[month] ?? { paid: 0, cost: 0, cashNet: 0 };
          entry.paid += p.paidAmount;
          entry.cost += p.totalCost;
          entry.cashNet += p.paidAmount - p.totalCost;
          acc[month] = entry;
          return acc;
        }, {}),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, v]) => ({ month, paid: v.paid, cost: v.cost, cashNet: v.cashNet }))
    : [];

  const receivables = (report?.remainingBreakdown ?? []) as RemainingItem[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("finance.title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" data-testid="input-start-date" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" data-testid="input-end-date" />
          </div>
          <Button onClick={applyFilter} data-testid="button-apply-filter">Apply</Button>
          <Button variant="outline" onClick={clearFilter}>Clear</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading report...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="bg-card/50" title={kpi.hint}>
                <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">{kpi.label}</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className={`text-lg font-bold ${kpi.color}`}>
                    {formatKpiValue(kpi.value ?? 0, { forceNegative: kpi.forceNegative, useSign: kpi.useSign })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {chartData.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader><CardTitle className="text-sm">{t("finance.cashNetProfit", { defaultValue: "Cash Net Profit" })} by Month</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                      <Legend />
                      <Bar dataKey="paid" name="Collected" fill="hsl(var(--chart-2, 217 91% 60%))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="cost" name="Direct Cost" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="cashNet" name="Cash Net" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {receivables.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm">{t("finance.receivables", { defaultValue: "Outstanding Receivables" })}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-card">
                      <tr className="border-b border-border">
                        {["Project", "Client", "Remaining"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.map((r) => (
                        <tr key={r.id} className="border-b border-border hover:bg-card/50">
                          <td className="px-3 py-2 font-medium">{r.projectName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.clientName || "—"}</td>
                          <td className="px-3 py-2 text-orange-400 font-semibold"><PrivacyWrapper value={r.remaining} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {report && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr className="border-b border-border">
                    {["Type", "Project", "Client", "Contract", "Cost", "Net Profit", "Paid", "Remaining", "Status"].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.projects as Project[]).length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No records found</td></tr>
                  ) : (report.projects as Project[]).map((p) => (
                    <tr key={p.id} data-testid={`row-finance-${p.id}`} className="border-b border-border hover:bg-card/50 transition-colors">
                      <td className="px-3 py-2"><Badge variant="outline" className={p.type === "Software" ? "text-blue-400 border-blue-500/30 text-[10px]" : "text-yellow-400 border-yellow-500/30 text-[10px]"}>{p.type}</Badge></td>
                      <td className="px-3 py-2 font-medium max-w-[150px] truncate">{p.projectName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.clientName ?? "—"}</td>
                      <td className="px-3 py-2"><PrivacyWrapper value={p.clientPrice} /></td>
                      <td className="px-3 py-2 text-red-400"><PrivacyWrapper value={p.totalCost} /></td>
                      <td className={`px-3 py-2 ${p.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}><PrivacyWrapper value={p.netProfit} /></td>
                      <td className="px-3 py-2 text-blue-400"><PrivacyWrapper value={p.paidAmount} /></td>
                      <td className="px-3 py-2 text-orange-400"><PrivacyWrapper value={p.remainingAmount} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
