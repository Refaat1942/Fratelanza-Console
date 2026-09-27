import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetReports, getGetReportsQueryKey } from "@workspace/api-client-react";
import { PeriodPicker, usePeriod, usePeriodLabel } from "@/components/period-picker";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Download } from "lucide-react";
import { expenseCategoryLabel } from "@/lib/expense-categories";
import { paymentMethodLabel } from "@/lib/payment-methods";

type Col<T> = { key: string; label: string; money?: boolean; render?: (row: T) => React.ReactNode };

function Table<T extends object>({ rows, cols, empty, total }: { rows: T[]; cols: Col<T>[]; empty: string; total?: Record<string, number> }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-card">
          <tr className="border-b border-border">
            {cols.map((c) => (
              <th key={c.key} className={`px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${c.money ? "text-end" : "text-start"}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-muted-foreground">{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 hover:bg-card/50">
              {cols.map((c) => {
                const v = (row as Record<string, unknown>)[c.key];
                return (
                  <td key={c.key} className={`px-3 py-2 ${c.money ? "text-end whitespace-nowrap" : ""}`}>
                    {c.render ? c.render(row) : c.money ? <PrivacyWrapper value={Number(v ?? 0)} /> : String(v ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
          {total && rows.length > 0 && (
            <tr className="border-t-2 border-border bg-card/60 font-semibold">
              {cols.map((c, i) => (
                <td key={c.key} className={`px-3 py-2 ${c.money ? "text-end whitespace-nowrap" : ""}`}>
                  {c.key in total ? <PrivacyWrapper value={total[c.key]!} /> : i === 0 ? "Total" : ""}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const sumOf = <T,>(rows: T[], ...keys: (keyof T)[]) =>
  Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)])) as Record<string, number>;

export default function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const { toast } = useToast();
  const { period, setPeriod, params } = usePeriod();
  const periodLabel = usePeriodLabel(period);
  const [exporting, setExporting] = useState(false);
  const { data: r, isLoading } = useGetReports(params, { query: { queryKey: getGetReportsQueryKey(params) } });

  const setDate = (key: "startDate" | "endDate", value: string) => setPeriod({ ...period, preset: "custom", [key]: value });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ lang });
      if (params.startDate) qs.set("startDate", params.startDate);
      if (params.endDate) qs.set("endDate", params.endDate);
      const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
      const res = await fetch(`${base}/reports/export?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(t("common.error"));
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `fratelanza-report_${params.startDate ?? "start"}_${params.endDate ?? "today"}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const s = r?.summary;
  const summaryRows = s ? [
    [t("reports.s.deals"), s.contractValue, ""],
    [t("reports.s.received"), s.moneyReceived, ""],
    [t("reports.s.given"), -s.givenToFreelancers, ""],
    [t("reports.s.share"), s.fratelanzaShare, "sub"],
    [t("reports.s.expenses"), -s.companyExpenses, ""],
    [t("reports.s.profitSoFar"), s.fratelanzaProfitSoFar, "total"],
    [t("reports.s.projectCosts"), -s.projectCosts, ""],
    [t("reports.s.estimated"), s.estimatedProfit, "total"],
    [t("reports.s.toCollect"), s.stillToCollect, ""],
    [t("reports.s.owedFreelancers"), s.stillOwedToFreelancers, ""],
  ] as [string, number, string][] : [];

  const empty = t("reports.empty");
  const method = (m: string) => (m ? paymentMethodLabel(m, lang) : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <Button onClick={exportExcel} disabled={exporting || !r} data-testid="button-export-reports" className="bg-green-600 hover:bg-green-700 text-white">
          <Download className="h-4 w-4 me-2" />{exporting ? t("common.loading") : t("reports.exportExcel")}
        </Button>
      </div>

      <Card className="bg-card/50">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("reports.quickPeriod")}</Label>
            <PeriodPicker period={period} onChange={setPeriod} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("period.from")}</Label>
            <Input type="date" className="w-40" value={period.startDate} onChange={(e) => setDate("startDate", e.target.value)} data-testid="input-report-from" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("period.to")}</Label>
            <Input type="date" className="w-40" value={period.endDate} onChange={(e) => setDate("endDate", e.target.value)} data-testid="input-report-to" />
          </div>
          <div className="text-sm text-muted-foreground pb-2">{t("period.showing")}: <b className="text-foreground">{periodLabel}</b></div>
        </CardContent>
      </Card>

      {isLoading || !r ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <Tabs defaultValue="summary">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="summary">{t("reports.tabs.summary")}</TabsTrigger>
            <TabsTrigger value="projects">{t("reports.tabs.projects")} ({r.projects.length})</TabsTrigger>
            <TabsTrigger value="received">{t("reports.tabs.received")} ({r.collections.length})</TabsTrigger>
            <TabsTrigger value="freelancerPayments">{t("reports.tabs.freelancerPayments")} ({r.freelancerPayments.length})</TabsTrigger>
            <TabsTrigger value="expenses">{t("reports.tabs.expenses")} ({r.expenses.length})</TabsTrigger>
            <TabsTrigger value="freelancers">{t("reports.tabs.freelancers")}</TabsTrigger>
            <TabsTrigger value="receivables">{t("reports.tabs.receivables")} ({r.receivables.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="pt-3">
            <div className="rounded-lg border border-border max-w-2xl">
              {summaryRows.map(([label, value, kind]) => (
                <div key={label} className={`flex justify-between px-4 py-2 border-b border-border/60 last:border-0 ${kind === "total" ? "font-bold bg-card/60" : kind === "sub" ? "font-semibold" : ""}`}>
                  <span>{label}</span>
                  <span className={kind ? (value < 0 ? "text-red-400" : "text-green-400") : value < 0 ? "text-muted-foreground" : ""}>
                    {value < 0 ? "- " : ""}<PrivacyWrapper value={Math.abs(value)} />
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="projects" className="pt-3">
            <Table rows={r.projects} empty={empty}
              total={sumOf(r.projects, "price", "freelancersCost", "otherCosts", "projectNet", "paid", "remaining", "toFreelancers", "fratelanzaShare")}
              cols={[
                { key: "projectName", label: t("reports.c.project") },
                { key: "clientName", label: t("reports.c.client") },
                { key: "startDate", label: t("reports.c.start") },
                { key: "price", label: t("reports.c.price"), money: true },
                { key: "freelancersCost", label: t("reports.c.freelancers"), money: true },
                { key: "otherCosts", label: t("reports.c.other"), money: true },
                { key: "projectNet", label: t("reports.c.net"), money: true },
                { key: "paid", label: t("reports.c.received"), money: true },
                { key: "remaining", label: t("reports.c.remaining"), money: true },
                { key: "toFreelancers", label: t("reports.c.given"), money: true },
                { key: "fratelanzaShare", label: t("reports.c.share"), money: true },
              ]} />
          </TabsContent>

          <TabsContent value="received" className="pt-3">
            <Table rows={r.collections} empty={empty} total={sumOf(r.collections, "amount")}
              cols={[
                { key: "date", label: t("reports.c.date") },
                { key: "projectName", label: t("reports.c.project") },
                { key: "clientName", label: t("reports.c.client") },
                { key: "method", label: t("reports.c.method"), render: (x) => method(x.method) },
                { key: "notes", label: t("reports.c.notes") },
                { key: "amount", label: t("reports.c.amount"), money: true },
              ]} />
          </TabsContent>

          <TabsContent value="freelancerPayments" className="pt-3">
            <Table rows={r.freelancerPayments} empty={empty} total={sumOf(r.freelancerPayments, "amount")}
              cols={[
                { key: "date", label: t("reports.c.date") },
                { key: "freelancerName", label: t("reports.c.freelancer") },
                { key: "projectName", label: t("reports.c.project") },
                { key: "method", label: t("reports.c.method"), render: (x) => method(x.method) },
                { key: "notes", label: t("reports.c.notes") },
                { key: "amount", label: t("reports.c.amount"), money: true },
              ]} />
          </TabsContent>

          <TabsContent value="expenses" className="pt-3 space-y-4">
            <Table rows={r.expensesByCategory} empty={empty} total={sumOf(r.expensesByCategory, "total")}
              cols={[
                { key: "category", label: t("reports.c.category"), render: (x) => expenseCategoryLabel(x.category, lang) },
                { key: "count", label: t("reports.c.count") },
                { key: "total", label: t("reports.c.amount"), money: true },
              ]} />
            <Table rows={r.expenses} empty={empty} total={sumOf(r.expenses, "amount")}
              cols={[
                { key: "date", label: t("reports.c.date") },
                { key: "category", label: t("reports.c.category"), render: (x) => expenseCategoryLabel(x.category, lang) },
                { key: "description", label: t("reports.c.description") },
                { key: "amount", label: t("reports.c.amount"), money: true },
              ]} />
          </TabsContent>

          <TabsContent value="freelancers" className="pt-3">
            <Table rows={r.freelancers} empty={empty} total={sumOf(r.freelancers, "commissions", "paid", "paidInPeriod", "owed")}
              cols={[
                { key: "name", label: t("reports.c.freelancer") },
                { key: "spec", label: t("reports.c.spec") },
                { key: "commissions", label: t("reports.c.commissions"), money: true },
                { key: "paid", label: t("reports.c.paidTotal"), money: true },
                { key: "paidInPeriod", label: t("reports.c.paidPeriod"), money: true },
                { key: "owed", label: t("reports.c.owed"), money: true },
              ]} />
          </TabsContent>

          <TabsContent value="receivables" className="pt-3">
            <Table rows={r.receivables} empty={empty} total={sumOf(r.receivables, "price", "paid", "remaining")}
              cols={[
                { key: "projectName", label: t("reports.c.project") },
                { key: "clientName", label: t("reports.c.client") },
                { key: "price", label: t("reports.c.price"), money: true },
                { key: "paid", label: t("reports.c.received"), money: true },
                { key: "remaining", label: t("reports.c.remaining"), money: true },
                { key: "nextPaymentDate", label: t("reports.c.nextDue"), render: (x) => (
                  <span className={x.overdue ? "text-red-400 font-semibold" : ""}>{x.nextPaymentDate || "—"}{x.overdue ? ` · ${t("projects.overdue")}` : ""}</span>
                ) },
              ]} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
