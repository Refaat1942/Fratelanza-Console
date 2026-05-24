import { useState } from "react";
import { useGetFinanceReport, getGetFinanceReportQueryKey } from "@workspace/api-client-react";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Project = { id: number; type: string; projectName: string; clientName?: string | null; clientPrice: number; totalCost: number; netProfit: number; paidAmount: number; remainingAmount: number; status: string; date: string; };

export default function Finance() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [applied, setApplied] = useState({ startDate: "", endDate: "" });

  const params = { startDate: applied.startDate || undefined, endDate: applied.endDate || undefined };
  const { data: report, isLoading } = useGetFinanceReport(params, { query: { queryKey: getGetFinanceReportQueryKey(params) } });

  const applyFilter = () => setApplied({ startDate, endDate });
  const clearFilter = () => { setStartDate(""); setEndDate(""); setApplied({ startDate: "", endDate: "" }); };

  const kpis = report ? [
    { label: "Total Revenue", value: report.totalRevenue, color: "text-foreground" },
    { label: "Total Paid", value: report.totalPaid, color: "text-blue-400" },
    { label: "Remaining", value: report.totalRemaining, color: "text-orange-400" },
    { label: "Total Cost", value: report.totalCost, color: "text-red-400" },
    { label: "Net Profit", value: report.totalNetProfit, color: "text-primary" },
    { label: "Expenses", value: report.totalExpenses, color: "text-red-400" },
    { label: "Net Balance", value: report.netBalance, color: (report.netBalance ?? 0) >= 0 ? "text-green-400" : "text-red-400" },
  ] : [];

  const chartData = report?.projects
    ? Object.entries(
        (report.projects as Project[]).reduce((acc: Record<string, number>, p) => {
          const month = p.date.slice(0, 7);
          acc[month] = (acc[month] ?? 0) + p.netProfit;
          return acc;
        }, {})
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, profit]) => ({ month, profit }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Financials & P&L</h1>
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
              <Card key={kpi.label} className="bg-card/50">
                <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-xs text-muted-foreground">{kpi.label}</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className={`text-lg font-bold ${kpi.color}`}><PrivacyWrapper value={kpi.value ?? 0} /></div>
                </CardContent>
              </Card>
            ))}
          </div>

          {chartData.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader><CardTitle className="text-sm">Net Profit by Month</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} itemStyle={{ color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {report && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr className="border-b border-border">
                    {["Type", "Project", "Client", "Revenue", "Cost", "Net Profit", "Paid", "Remaining", "Status"].map((h) => (
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
                      <td className="px-3 py-2 text-green-400"><PrivacyWrapper value={p.netProfit} /></td>
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
