import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateEquityEntry, useDeleteEquityEntry, useUpdateFinanceSettings, getGetFinanceStatementsQueryKey } from "@workspace/api-client-react";
import { usePrivacy } from "@/lib/privacy-context";
import { expenseCategoryLabel } from "@/lib/expense-categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";

/* ───────── Data shape returned by GET /finance/statements ───────── */

type Line = { key: string; amount: number };
export type IncomeStatement = {
  startDate: string; endDate: string;
  revenue: { total: number; lines: Line[] };
  costOfRevenue: { total: number; freelancers: number; other: number };
  grossProfit: number;
  operatingExpenses: { total: number; lines: Line[] };
  ebitda: number; depreciation: number; ebit: number; financeCosts: number; profitBeforeTax: number; taxes: number; netIncome: number;
  margins: { gross: number; ebitda: number; ebit: number; net: number };
};
export type Statements = {
  period: { startDate: string; endDate: string };
  incomeStatement: { current: IncomeStatement; previous: IncomeStatement | null };
  balanceSheet: {
    asOf: string;
    assets: { cash: number; receivables: number; freelancerAdvances: number; current: number; equipmentCost: number; accumulatedDepreciation: number; equipmentNet: number; nonCurrent: number; total: number };
    liabilities: { freelancerPayables: number; customerAdvances: number; current: number; total: number };
    equity: { capital: number; drawings: number; retainedEarnings: number; total: number };
    liabilitiesAndEquity: number; difference: number;
  };
  cashFlow: {
    operating: { collections: number; freelancerPayments: number; otherProjectCosts: number; operatingExpenses: number; financeCosts: number; taxes: number; net: number };
    investing: { equipment: number; net: number };
    financing: { capital: number; drawings: number; net: number };
    netChange: number; openingCash: number; closingCash: number;
  };
  ratios: { key: string; value: number; unit: "pct" | "x" | "days" | "months" | "egp"; group: string }[];
  settings: { usefulLifeMonths: number };
  equityEntries: { id: number; type: string; amount: number; date: string; notes: string }[];
};

/* ───────── Formatting (accounting style: negatives in brackets) ───────── */

function useMoney() {
  const { isPrivate } = usePrivacy();
  return (v: number) => {
    if (isPrivate) return "***";
    const s = Math.abs(Math.round(v)).toLocaleString("en-US");
    return v < -0.5 ? `(${s})` : s;
  };
}

type RowKind = "line" | "sub" | "total" | "grand" | "head";
type Row = { label: string; value?: number; prev?: number | null; kind?: RowKind; indent?: boolean; hint?: string };

function StatementTable({ rows, revenue, showPrev, title, subtitle }: { rows: Row[]; revenue?: number; showPrev?: boolean; title: string; subtitle: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  const change = (cur: number, prev: number) => (prev ? `${Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10}%` : "—");
  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="text-xs text-muted-foreground">{subtitle} · {t("acct.egp")}</div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium" />
              <th className="py-2 text-end font-medium w-36">{t("acct.current")}</th>
              {revenue !== undefined && <th className="py-2 text-end font-medium w-24">{t("acct.pctRevenue")}</th>}
              {showPrev && <th className="py-2 text-end font-medium w-36">{t("acct.previous")}</th>}
              {showPrev && <th className="py-2 text-end font-medium w-24">{t("acct.change")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "head") {
                return <tr key={i}><td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-primary">{r.label}</td></tr>;
              }
              const bold = r.kind === "sub" || r.kind === "total" || r.kind === "grand";
              const border = r.kind === "sub" ? "border-t border-border" : r.kind === "total" ? "border-t-2 border-border" : r.kind === "grand" ? "border-t-2 border-b-4 border-double border-foreground/60" : "";
              const color = bold && (r.value ?? 0) < 0 ? "text-red-400" : bold && r.kind !== "sub" ? "text-green-400" : "";
              return (
                <tr key={i} className={`${border} ${r.kind === "grand" ? "bg-card" : ""}`} title={r.hint}>
                  <td className={`py-1.5 ${r.indent ? "ps-5 text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}>{r.label}</td>
                  <td className={`py-1.5 text-end tabular-nums ${bold ? "font-bold" : ""} ${color}`}>{r.value === undefined ? "" : money(r.value)}</td>
                  {revenue !== undefined && <td className="py-1.5 text-end tabular-nums text-xs text-muted-foreground">{r.value !== undefined && revenue ? `${Math.round((r.value / revenue) * 1000) / 10}%` : ""}</td>}
                  {showPrev && <td className="py-1.5 text-end tabular-nums text-muted-foreground">{r.prev === undefined || r.prev === null ? "" : money(r.prev)}</td>}
                  {showPrev && <td className="py-1.5 text-end tabular-nums text-xs text-muted-foreground">{r.value !== undefined && r.prev !== undefined && r.prev !== null ? change(r.value, r.prev) : ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function useLineLabel() {
  const { t, i18n } = useTranslation();
  return (key: string) => {
    if (key === "Software" || key === "Training") return t(`acct.type${key}`);
    if (key === "unlinked_freelancer_payments") return t("acct.unlinkedFreelancers");
    return expenseCategoryLabel(key, i18n.language ?? "en");
  };
}

/* ───────── Income statement ───────── */

export function IncomeStatementView({ s }: { s: Statements }) {
  const { t } = useTranslation();
  const label = useLineLabel();
  const cur = s.incomeStatement.current;
  const prev = s.incomeStatement.previous;
  const pl = (k: string, list: "revenue" | "operatingExpenses") => prev ? prev[list].lines.find((l) => l.key === k)?.amount ?? 0 : null;
  const rows: Row[] = [
    { label: t("acct.revenue"), kind: "head" },
    ...cur.revenue.lines.map((l) => ({ label: label(l.key), value: l.amount, prev: pl(l.key, "revenue"), indent: true })),
    { label: t("acct.totalRevenue"), value: cur.revenue.total, prev: prev?.revenue.total, kind: "sub" as RowKind, hint: t("acct.hRevenue") },
    { label: t("acct.costOfRevenue"), kind: "head" },
    { label: t("acct.freelancerCommissions"), value: -cur.costOfRevenue.freelancers, prev: prev ? -prev.costOfRevenue.freelancers : null, indent: true },
    { label: t("acct.otherProjectCosts"), value: -cur.costOfRevenue.other, prev: prev ? -prev.costOfRevenue.other : null, indent: true },
    { label: t("acct.grossProfit"), value: cur.grossProfit, prev: prev?.grossProfit, kind: "total", hint: t("acct.hGross") },
    { label: t("acct.operatingExpenses"), kind: "head" },
    ...cur.operatingExpenses.lines.map((l) => ({ label: label(l.key), value: -l.amount, prev: prev ? -(pl(l.key, "operatingExpenses") ?? 0) : null, indent: true })),
    { label: t("acct.totalOpex"), value: -cur.operatingExpenses.total, prev: prev ? -prev.operatingExpenses.total : null, kind: "sub" },
    { label: t("acct.ebitda"), value: cur.ebitda, prev: prev?.ebitda, kind: "total", hint: t("acct.hEbitda") },
    { label: t("acct.depreciation"), value: -cur.depreciation, prev: prev ? -prev.depreciation : null, indent: true, hint: t("acct.hDep", { months: s.settings.usefulLifeMonths }) },
    { label: t("acct.ebit"), value: cur.ebit, prev: prev?.ebit, kind: "total", hint: t("acct.hEbit") },
    { label: t("acct.financeCosts"), value: -cur.financeCosts, prev: prev ? -prev.financeCosts : null, indent: true },
    { label: t("acct.profitBeforeTax"), value: cur.profitBeforeTax, prev: prev?.profitBeforeTax, kind: "total" },
    { label: t("acct.taxes"), value: -cur.taxes, prev: prev ? -prev.taxes : null, indent: true },
    { label: t("acct.netIncome"), value: cur.netIncome, prev: prev?.netIncome, kind: "grand", hint: t("acct.hNet") },
  ];
  const m = cur.margins;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([["grossMargin", m.gross, cur.grossProfit], ["ebitdaMargin", m.ebitda, cur.ebitda], ["ebitMargin", m.ebit, cur.ebit], ["netMargin", m.net, cur.netIncome]] as const).map(([k, pctV, v]) => (
          <MetricCard key={k} label={t(`acct.r.${k}`)} value={`${pctV}%`} sub={v} />
        ))}
      </div>
      <StatementTable title={t("acct.incomeStatement")} subtitle={`${cur.startDate || t("acct.beginning")} → ${cur.endDate}${prev ? ` · ${t("acct.vsPrevious", { start: prev.startDate, end: prev.endDate })}` : ""}`} rows={rows} revenue={cur.revenue.total} showPrev={!!prev} />
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: number }) {
  const money = useMoney();
  const { isPrivate } = usePrivacy();
  return (
    <Card className="bg-card/50">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{isPrivate ? "***" : value}</div>
        {sub !== undefined && <div className={`text-xs ${sub < 0 ? "text-red-400" : "text-muted-foreground"}`}>EGP {money(sub)}</div>}
      </CardContent>
    </Card>
  );
}

/* ───────── Balance sheet ───────── */

export function BalanceSheetView({ s }: { s: Statements }) {
  const { t } = useTranslation();
  const b = s.balanceSheet;
  const balanced = Math.abs(b.difference) < 1;
  const assets: Row[] = [
    { label: t("acct.currentAssets"), kind: "head" },
    { label: t("acct.cash"), value: b.assets.cash, indent: true, hint: t("acct.hCash") },
    { label: t("acct.receivables"), value: b.assets.receivables, indent: true, hint: t("acct.hReceivables") },
    { label: t("acct.freelancerAdvances"), value: b.assets.freelancerAdvances, indent: true, hint: t("acct.hFreelancerAdvances") },
    { label: t("acct.totalCurrentAssets"), value: b.assets.current, kind: "sub" },
    { label: t("acct.nonCurrentAssets"), kind: "head" },
    { label: t("acct.equipmentCost"), value: b.assets.equipmentCost, indent: true },
    { label: t("acct.accumulatedDepreciation"), value: -b.assets.accumulatedDepreciation, indent: true },
    { label: t("acct.equipmentNet"), value: b.assets.equipmentNet, kind: "sub" },
    { label: t("acct.totalAssets"), value: b.assets.total, kind: "grand" },
  ];
  const liabEq: Row[] = [
    { label: t("acct.currentLiabilities"), kind: "head" },
    { label: t("acct.freelancerPayables"), value: b.liabilities.freelancerPayables, indent: true, hint: t("acct.hFreelancerPayables") },
    { label: t("acct.customerAdvances"), value: b.liabilities.customerAdvances, indent: true, hint: t("acct.hCustomerAdvances") },
    { label: t("acct.totalLiabilities"), value: b.liabilities.total, kind: "sub" },
    { label: t("acct.equity"), kind: "head" },
    { label: t("acct.capital"), value: b.equity.capital, indent: true },
    { label: t("acct.drawings"), value: -b.equity.drawings, indent: true },
    { label: t("acct.retainedEarnings"), value: b.equity.retainedEarnings, indent: true, hint: t("acct.hRetained") },
    { label: t("acct.totalEquity"), value: b.equity.total, kind: "sub" },
    { label: t("acct.totalLiabEquity"), value: b.liabilitiesAndEquity, kind: "grand" },
  ];
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${balanced ? "border-green-500/40 bg-green-500/10 text-green-500" : "border-red-500/40 bg-red-500/10 text-red-500"}`}>
        {balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {balanced ? t("acct.balanced", { date: b.asOf }) : t("acct.notBalanced", { diff: b.difference })}
      </div>
      {b.assets.cash < 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-500">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{t("acct.negativeCash")}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StatementTable title={t("acct.assets")} subtitle={t("acct.asOf", { date: b.asOf })} rows={assets} />
        <StatementTable title={t("acct.liabilitiesAndEquity")} subtitle={t("acct.asOf", { date: b.asOf })} rows={liabEq} />
      </div>
    </div>
  );
}

/* ───────── Cash flow ───────── */

export function CashFlowView({ s }: { s: Statements }) {
  const { t } = useTranslation();
  const c = s.cashFlow;
  const rows: Row[] = [
    { label: t("acct.openingCash"), value: c.openingCash, kind: "sub" },
    { label: t("acct.operatingActivities"), kind: "head" },
    { label: t("acct.collections"), value: c.operating.collections, indent: true },
    { label: t("acct.paidToFreelancers"), value: c.operating.freelancerPayments, indent: true },
    { label: t("acct.otherProjectCosts"), value: c.operating.otherProjectCosts, indent: true },
    { label: t("acct.operatingExpensesPaid"), value: c.operating.operatingExpenses, indent: true },
    { label: t("acct.financeCosts"), value: c.operating.financeCosts, indent: true },
    { label: t("acct.taxes"), value: c.operating.taxes, indent: true },
    { label: t("acct.netOperating"), value: c.operating.net, kind: "sub" },
    { label: t("acct.investingActivities"), kind: "head" },
    { label: t("acct.equipmentPurchases"), value: c.investing.equipment, indent: true },
    { label: t("acct.netInvesting"), value: c.investing.net, kind: "sub" },
    { label: t("acct.financingActivities"), kind: "head" },
    { label: t("acct.capitalIn"), value: c.financing.capital, indent: true },
    { label: t("acct.drawingsOut"), value: c.financing.drawings, indent: true },
    { label: t("acct.netFinancing"), value: c.financing.net, kind: "sub" },
    { label: t("acct.netChange"), value: c.netChange, kind: "total" },
    { label: t("acct.closingCash"), value: c.closingCash, kind: "grand" },
  ];
  return <StatementTable title={t("acct.cashFlow")} subtitle={`${s.period.startDate || t("acct.beginning")} → ${s.period.endDate} · ${t("acct.directMethod")}`} rows={rows} />;
}

/* ───────── Ratios ───────── */

export function RatiosView({ s }: { s: Statements }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { isPrivate } = usePrivacy();
  const fmt = (v: number, unit: string) => {
    if (isPrivate) return "***";
    if (unit === "pct") return `${v}%`;
    if (unit === "x") return `${v}×`;
    if (unit === "days") return t("acct.days", { n: v });
    if (unit === "months") return t("acct.months", { n: v });
    return `EGP ${money(v)}`;
  };
  const groups = ["profitability", "efficiency", "liquidity", "solvency"];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g} className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t(`acct.g.${g}`)}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {s.ratios.filter((r) => r.group === g).map((r) => (
              <div key={r.key} className="rounded-lg border border-border p-3" data-testid={`ratio-${r.key}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{t(`acct.r.${r.key}`)}</span>
                  <span className="text-lg font-bold tabular-nums">{fmt(r.value, r.unit)}</span>
                </div>
                <div className="text-[11px] text-primary/80 mt-1 font-mono">{t(`acct.f.${r.key}`)}</div>
                <div className="text-xs text-muted-foreground mt-1">{t(`acct.m.${r.key}`)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ───────── Capital, drawings, settings & policies ───────── */

export function CapitalAndPoliciesView({ s, params }: { s: Statements; params: { startDate?: string; endDate?: string } }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const money = useMoney();
  const create = useCreateEquityEntry();
  const del = useDeleteEquityEntry();
  const saveSettings = useUpdateFinanceSettings();
  const [form, setForm] = useState({ type: "capital", amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [life, setLife] = useState(String(s.settings.usefulLifeMonths));
  const refresh = () => qc.invalidateQueries({ queryKey: getGetFinanceStatementsQueryKey(params) });

  const add = () => create.mutate({ data: { type: form.type, amount: Number(form.amount), date: form.date, notes: form.notes || undefined } }, {
    onSuccess: () => { setForm((f) => ({ ...f, amount: "", notes: "" })); refresh(); toast({ title: t("acct.entrySaved") }); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("acct.ownerEquity")}</CardTitle>
          <div className="text-xs text-muted-foreground">{t("acct.ownerEquityHint")}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">{t("acct.entryType")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-equity-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="capital">{t("acct.capitalIn")}</SelectItem>
                  <SelectItem value="drawing">{t("acct.drawingsOut")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">{t("acct.amount")}</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} data-testid="input-equity-amount" /></div>
            <div className="space-y-1"><Label className="text-xs">{t("acct.date")}</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">{t("acct.notes")}</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <Button onClick={add} disabled={!Number(form.amount) || create.isPending} data-testid="button-add-equity">{t("acct.addEntry")}</Button>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {s.equityEntries.length === 0 ? (
                  <tr><td className="p-3 text-center text-muted-foreground">{t("acct.noEntries")}</td></tr>
                ) : s.equityEntries.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-2">{e.type === "capital" ? t("acct.capitalIn") : t("acct.drawingsOut")}{e.notes ? <span className="text-muted-foreground"> · {e.notes}</span> : null}</td>
                    <td className={`px-3 py-2 text-end tabular-nums ${e.type === "capital" ? "text-green-400" : "text-red-400"}`}>{money(e.type === "capital" ? e.amount : -e.amount)}</td>
                    <td className="w-8"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del.mutate({ id: e.id }, { onSuccess: refresh })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("acct.settings")}</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <div className="space-y-1 flex-1"><Label className="text-xs">{t("acct.usefulLife")}</Label><Input type="number" min={1} value={life} onChange={(e) => setLife(e.target.value)} data-testid="input-useful-life" /></div>
            <Button variant="outline" onClick={() => saveSettings.mutate({ data: { usefulLifeMonths: Number(life) } }, { onSuccess: () => { refresh(); toast({ title: t("acct.settingsSaved") }); } })}>{t("common.save")}</Button>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("acct.policies")}</CardTitle></CardHeader>
          <CardContent>
            <ol className="list-decimal ps-5 space-y-2 text-sm">
              {["basis", "revenue", "matching", "opex", "capex", "finance", "unlinked", "cash", "equity"].map((k) => (
                <li key={k}><b>{t(`acct.p.${k}.title`)}</b> — <span className="text-muted-foreground">{t(`acct.p.${k}.text`, { months: s.settings.usefulLifeMonths })}</span></li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
