import {
  db, projectsTable, projectPaymentsTable, projectTeamTable, freelancerPaymentsTable,
  expensesTable, equityEntriesTable, appSettingsTable,
} from "@workspace/db";
import { cashReceipts, freelancerPayables, nameKey, projectCommitments, projectDate } from "./financials.js";

/**
 * Financial statements on the accrual basis.
 *
 * Accounting policies (shown to the user on the Finance page):
 * - Revenue is recognised when a project starts (start date, else the day it was
 *   recorded) at its contract value. A cancelled project's revenue is limited to
 *   what the client paid.
 * - Matching: freelancer commissions and other project costs are cost of revenue
 *   in the same period as the project's revenue.
 * - Company expenses are period costs by category. Equipment is capitalised and
 *   depreciated straight-line monthly from the month of purchase. Bank fees are
 *   finance costs and taxes are shown below profit before tax.
 * - Freelancer payments not linked to any project are operating expenses.
 * - Cash = owner capital − drawings + money received − everything paid out.
 */

export const NON_OPERATING = new Set(["equipment", "bank_fees", "taxes"]);
export const DEFAULT_USEFUL_LIFE_MONTHS = 36;

type Line = { key: string; amount: number };

export type IncomeStatement = {
  startDate: string; endDate: string;
  revenue: { total: number; lines: Line[] };
  costOfRevenue: { total: number; freelancers: number; other: number };
  grossProfit: number;
  operatingExpenses: { total: number; lines: Line[] };
  ebitda: number;
  depreciation: number;
  ebit: number;
  financeCosts: number;
  profitBeforeTax: number;
  taxes: number;
  netIncome: number;
  margins: { gross: number; ebitda: number; ebit: number; net: number };
};

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const inRange = (d: string, s?: string, e?: string) => (!s || d >= s) && (!e || d <= e);
const upTo = (d: string, e?: string) => !e || d <= e;
const dayBefore = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export async function getUsefulLifeMonths(): Promise<number> {
  const rows = await db.select().from(appSettingsTable);
  const v = Number(rows.find((r) => r.key === "equipment_useful_life_months")?.value);
  return Number.isFinite(v) && v >= 1 ? Math.round(v) : DEFAULT_USEFUL_LIFE_MONTHS;
}

async function loadAll() {
  const [projects, payments, team, frPayments, expenses, equity, lifeMonths] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(projectPaymentsTable),
    db.select().from(projectTeamTable),
    db.select().from(freelancerPaymentsTable),
    db.select().from(expensesTable),
    db.select().from(equityEntriesTable),
    getUsefulLifeMonths(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const receipts = cashReceipts(projects, payments);
  const payables = freelancerPayables(projects, team, frPayments);
  const frPays = frPayments.map((f) => ({
    projectId: f.projectId, name: nameKey(f.freelancerName), amount: Number(f.amount),
    date: (f.paidAt || f.createdAt.toISOString()).slice(0, 10),
  }));
  const exps = expenses.map((e) => ({ category: e.category, amount: Number(e.amount), date: (e.date || e.createdAt.toISOString()).slice(0, 10) }));
  const eq = equity.map((q) => ({ id: q.id, type: q.type, amount: Number(q.amount), date: q.date.slice(0, 10), notes: q.notes ?? "" }));
  return { projects, team, receipts, payables, frPays, exps, eq, lifeMonths, today };
}
type Data = Awaited<ReturnType<typeof loadAll>>;

/** Money received on a project up to a date (inclusive). */
function receivedUpTo(d: Data, projectId: number, end?: string) {
  return d.receipts.filter((r) => r.projectId === projectId && upTo(r.date, end)).reduce((s, r) => s + r.amount, 0);
}

/** Recognised contract value: price, or only what was received for a cancelled project. */
function contractValue(d: Data, p: Data["projects"][number], end?: string) {
  return p.status === "Cancelled" ? receivedUpTo(d, p.id, end) : Number(p.clientPrice);
}

/** Straight-line depreciation of equipment for the months [startMonth, endMonth]. */
function depreciation(d: Data, start: string | undefined, end: string) {
  const from = start ? monthIndex(start) : -Infinity;
  const to = monthIndex(end);
  let total = 0;
  for (const e of d.exps) {
    if (e.category !== "equipment" || !upTo(e.date, end)) continue;
    const first = monthIndex(e.date);
    const last = first + d.lifeMonths - 1;
    const months = Math.max(0, Math.min(last, to) - Math.max(first, from) + 1);
    total += (e.amount / d.lifeMonths) * months;
  }
  return total;
}

function incomeStatement(d: Data, start: string | undefined, end: string): IncomeStatement {
  const projects = d.projects.filter((p) => inRange(projectDate(p), start, end));
  const byType = new Map<string, number>();
  let freelancers = 0;
  let other = 0;
  for (const p of projects) {
    byType.set(p.type, (byType.get(p.type) ?? 0) + contractValue(d, p, end));
    freelancers += d.payables.commissions(p);
    other += d.payables.otherCosts(p);
  }
  const revenueTotal = [...byType.values()].reduce((s, v) => s + v, 0);
  const costTotal = freelancers + other;
  const grossProfit = revenueTotal - costTotal;

  const opex = new Map<string, number>();
  let financeCosts = 0;
  let taxes = 0;
  for (const e of d.exps) {
    if (!inRange(e.date, start, end)) continue;
    if (e.category === "bank_fees") financeCosts += e.amount;
    else if (e.category === "taxes") taxes += e.amount;
    else if (e.category !== "equipment") opex.set(e.category, (opex.get(e.category) ?? 0) + e.amount);
  }
  const unlinked = d.frPays.filter((f) => f.projectId == null && inRange(f.date, start, end)).reduce((s, f) => s + f.amount, 0);
  if (unlinked) opex.set("unlinked_freelancer_payments", unlinked);
  const opexTotal = [...opex.values()].reduce((s, v) => s + v, 0);

  const ebitda = grossProfit - opexTotal;
  const dep = depreciation(d, start, end);
  const ebit = ebitda - dep;
  const profitBeforeTax = ebit - financeCosts;
  const netIncome = profitBeforeTax - taxes;

  return {
    startDate: start ?? "", endDate: end,
    revenue: { total: r2(revenueTotal), lines: [...byType.entries()].map(([key, amount]) => ({ key, amount: r2(amount) })).sort((a, b) => b.amount - a.amount) },
    costOfRevenue: { total: r2(costTotal), freelancers: r2(freelancers), other: r2(other) },
    grossProfit: r2(grossProfit),
    operatingExpenses: { total: r2(opexTotal), lines: [...opex.entries()].map(([key, amount]) => ({ key, amount: r2(amount) })).sort((a, b) => b.amount - a.amount) },
    ebitda: r2(ebitda),
    depreciation: r2(dep),
    ebit: r2(ebit),
    financeCosts: r2(financeCosts),
    profitBeforeTax: r2(profitBeforeTax),
    taxes: r2(taxes),
    netIncome: r2(netIncome),
    margins: { gross: pct(grossProfit, revenueTotal), ebitda: pct(ebitda, revenueTotal), ebit: pct(ebit, revenueTotal), net: pct(netIncome, revenueTotal) },
  };
}

/** Cash on hand at the end of a day. */
function cashAt(d: Data, end: string) {
  const capital = d.eq.filter((q) => q.type === "capital" && upTo(q.date, end)).reduce((s, q) => s + q.amount, 0);
  const drawings = d.eq.filter((q) => q.type === "drawing" && upTo(q.date, end)).reduce((s, q) => s + q.amount, 0);
  const received = d.receipts.filter((r) => upTo(r.date, end)).reduce((s, r) => s + r.amount, 0);
  const frPaid = d.frPays.filter((f) => upTo(f.date, end)).reduce((s, f) => s + f.amount, 0);
  const otherCosts = d.projects.filter((p) => upTo(projectDate(p), end)).reduce((s, p) => s + d.payables.otherCosts(p), 0);
  const spent = d.exps.filter((e) => upTo(e.date, end)).reduce((s, e) => s + e.amount, 0);
  return capital - drawings + received - frPaid - otherCosts - spent;
}

function balanceSheet(d: Data, end: string) {
  const recognised = d.projects.filter((p) => upTo(projectDate(p), end));
  const recognisedIds = new Set(recognised.map((p) => p.id));

  // Clients: receivable or advance per project
  let receivables = 0;
  let customerAdvances = 0;
  for (const p of d.projects) {
    const received = receivedUpTo(d, p.id, end);
    const value = recognisedIds.has(p.id) ? contractValue(d, p, end) : 0;
    receivables += Math.max(0, value - received);
    customerAdvances += Math.max(0, received - value);
  }

  // Freelancers: payable or advance per project + freelancer
  const commission = new Map<string, number>();
  for (const p of recognised) {
    for (const c of projectCommitments(p, d.team)) commission.set(`${p.id}|${c.name}`, (commission.get(`${p.id}|${c.name}`) ?? 0) + c.commission);
  }
  const paid = new Map<string, number>();
  for (const f of d.frPays) {
    if (f.projectId == null || !upTo(f.date, end)) continue;
    paid.set(`${f.projectId}|${f.name}`, (paid.get(`${f.projectId}|${f.name}`) ?? 0) + f.amount);
  }
  let freelancerPayables = 0;
  let freelancerAdvances = 0;
  for (const k of new Set([...commission.keys(), ...paid.keys()])) {
    const c = commission.get(k) ?? 0;
    const pd = paid.get(k) ?? 0;
    freelancerPayables += Math.max(0, c - pd);
    freelancerAdvances += Math.max(0, pd - c);
  }

  const equipmentCost = d.exps.filter((e) => e.category === "equipment" && upTo(e.date, end)).reduce((s, e) => s + e.amount, 0);
  const accumulatedDepreciation = depreciation(d, undefined, end);
  const equipmentNet = equipmentCost - accumulatedDepreciation;
  const cash = cashAt(d, end);

  const currentAssets = cash + receivables + freelancerAdvances;
  const totalAssets = currentAssets + equipmentNet;
  const totalLiabilities = freelancerPayables + customerAdvances;

  const capital = d.eq.filter((q) => q.type === "capital" && upTo(q.date, end)).reduce((s, q) => s + q.amount, 0);
  const drawings = d.eq.filter((q) => q.type === "drawing" && upTo(q.date, end)).reduce((s, q) => s + q.amount, 0);
  const retainedEarnings = incomeStatement(d, undefined, end).netIncome;
  const totalEquity = capital - drawings + retainedEarnings;

  return {
    asOf: end,
    assets: {
      cash: r2(cash), receivables: r2(receivables), freelancerAdvances: r2(freelancerAdvances), current: r2(currentAssets),
      equipmentCost: r2(equipmentCost), accumulatedDepreciation: r2(accumulatedDepreciation), equipmentNet: r2(equipmentNet), nonCurrent: r2(equipmentNet),
      total: r2(totalAssets),
    },
    liabilities: { freelancerPayables: r2(freelancerPayables), customerAdvances: r2(customerAdvances), current: r2(totalLiabilities), total: r2(totalLiabilities) },
    equity: { capital: r2(capital), drawings: r2(drawings), retainedEarnings: r2(retainedEarnings), total: r2(totalEquity) },
    liabilitiesAndEquity: r2(totalLiabilities + totalEquity),
    difference: r2(totalAssets - totalLiabilities - totalEquity),
  };
}

function cashFlow(d: Data, start: string | undefined, end: string) {
  const inP = (date: string) => inRange(date, start, end);
  const collections = d.receipts.filter((r) => inP(r.date)).reduce((s, r) => s + r.amount, 0);
  const freelancerPayments = d.frPays.filter((f) => inP(f.date)).reduce((s, f) => s + f.amount, 0);
  const otherProjectCosts = d.projects.filter((p) => inP(projectDate(p))).reduce((s, p) => s + d.payables.otherCosts(p), 0);
  const sumExp = (pred: (c: string) => boolean) => d.exps.filter((e) => inP(e.date) && pred(e.category)).reduce((s, e) => s + e.amount, 0);
  const operatingExpenses = sumExp((c) => !NON_OPERATING.has(c));
  const financeCosts = sumExp((c) => c === "bank_fees");
  const taxes = sumExp((c) => c === "taxes");
  const equipment = sumExp((c) => c === "equipment");
  const capital = d.eq.filter((q) => q.type === "capital" && inP(q.date)).reduce((s, q) => s + q.amount, 0);
  const drawings = d.eq.filter((q) => q.type === "drawing" && inP(q.date)).reduce((s, q) => s + q.amount, 0);

  const operating = collections - freelancerPayments - otherProjectCosts - operatingExpenses - financeCosts - taxes;
  const investing = -equipment;
  const financing = capital - drawings;
  const openingCash = start ? cashAt(d, dayBefore(start)) : 0;
  const closingCash = cashAt(d, end);
  return {
    operating: {
      collections: r2(collections), freelancerPayments: r2(-freelancerPayments), otherProjectCosts: r2(-otherProjectCosts),
      operatingExpenses: r2(-operatingExpenses), financeCosts: r2(-financeCosts), taxes: r2(-taxes), net: r2(operating),
    },
    investing: { equipment: r2(-equipment), net: r2(investing) },
    financing: { capital: r2(capital), drawings: r2(-drawings), net: r2(financing) },
    netChange: r2(operating + investing + financing),
    openingCash: r2(openingCash),
    closingCash: r2(closingCash),
  };
}

function ratios(d: Data, is: IncomeStatement, bs: ReturnType<typeof balanceSheet>, start: string | undefined, end: string) {
  const firstActivity = [
    ...d.projects.map((p) => projectDate(p)), ...d.exps.map((e) => e.date), ...d.receipts.map((r) => r.date),
  ].sort()[0] ?? end;
  const from = start ?? firstActivity;
  const days = Math.max(1, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const months = Math.max(1, days / 30.44);
  const fixedCosts = is.operatingExpenses.total + is.depreciation + is.financeCosts;
  const grossMarginRatio = is.revenue.total ? is.grossProfit / is.revenue.total : 0;
  const monthlyBurn = (is.operatingExpenses.total + is.financeCosts + is.taxes) / months;
  const lifetimeValue = d.projects.filter((p) => upTo(projectDate(p), end)).reduce((s, p) => s + contractValue(d, p, end), 0);
  const lifetimeReceived = d.receipts.filter((r) => upTo(r.date, end)).reduce((s, r) => s + r.amount, 0);
  const x = (v: number) => Math.round(v * 100) / 100;
  return [
    { key: "grossMargin", value: is.margins.gross, unit: "pct", group: "profitability" },
    { key: "ebitdaMargin", value: is.margins.ebitda, unit: "pct", group: "profitability" },
    { key: "ebitMargin", value: is.margins.ebit, unit: "pct", group: "profitability" },
    { key: "netMargin", value: is.margins.net, unit: "pct", group: "profitability" },
    { key: "freelancerCostRatio", value: pct(is.costOfRevenue.freelancers, is.revenue.total), unit: "pct", group: "efficiency" },
    { key: "opexRatio", value: pct(is.operatingExpenses.total, is.revenue.total), unit: "pct", group: "efficiency" },
    { key: "breakEvenRevenue", value: grossMarginRatio > 0 ? r2(fixedCosts / grossMarginRatio) : 0, unit: "egp", group: "efficiency" },
    { key: "currentRatio", value: bs.liabilities.current ? x(bs.assets.current / bs.liabilities.current) : 0, unit: "x", group: "liquidity" },
    { key: "cashRatio", value: bs.liabilities.current ? x(bs.assets.cash / bs.liabilities.current) : 0, unit: "x", group: "liquidity" },
    { key: "dso", value: is.revenue.total ? Math.round((bs.assets.receivables / is.revenue.total) * days) : 0, unit: "days", group: "liquidity" },
    { key: "collectionRate", value: pct(lifetimeReceived, lifetimeValue), unit: "pct", group: "liquidity" },
    { key: "monthlyBurn", value: r2(monthlyBurn), unit: "egp", group: "liquidity" },
    { key: "cashRunway", value: monthlyBurn > 0 ? x(Math.max(0, bs.assets.cash) / monthlyBurn) : 0, unit: "months", group: "liquidity" },
    { key: "equityRatio", value: pct(bs.equity.total, bs.assets.total), unit: "pct", group: "solvency" },
    { key: "liabilitiesToEquity", value: bs.equity.total ? x(bs.liabilities.total / bs.equity.total) : 0, unit: "x", group: "solvency" },
  ];
}

/** Income statement (with previous-period comparison), balance sheet, cash flow and ratios. */
export async function buildStatements(startDate?: string, endDate?: string) {
  const d = await loadAll();
  const end = endDate || d.today;
  const current = incomeStatement(d, startDate, end);
  let previous: IncomeStatement | null = null;
  if (startDate) {
    const lengthDays = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000) + 1;
    const prevEnd = dayBefore(startDate);
    const prevStartDate = new Date(`${prevEnd}T12:00:00Z`);
    prevStartDate.setUTCDate(prevStartDate.getUTCDate() - (lengthDays - 1));
    previous = incomeStatement(d, prevStartDate.toISOString().slice(0, 10), prevEnd);
  }
  const bs = balanceSheet(d, end);
  return {
    period: { startDate: startDate ?? "", endDate: end },
    incomeStatement: { current, previous },
    balanceSheet: bs,
    cashFlow: cashFlow(d, startDate, end),
    ratios: ratios(d, current, bs, startDate, end),
    settings: { usefulLifeMonths: d.lifeMonths },
    equityEntries: d.eq.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export type DataIssue = {
  key: "paid_mismatch" | "client_overpaid" | "freelancer_overpaid" | "freelancer_payment_orphan" | "future_date" | "no_price" | "negative_cash" | "not_balanced";
  severity: "error" | "warning" | "info";
  projectId: number | null;
  label: string;
  amount: number;
  date: string;
};

/**
 * Data checks: anything in the records that would make the statements wrong or
 * misleading, plus the automatic corrections already made to old data.
 */
export async function buildChecks() {
  const d = await loadAll();
  const [payments, settings] = await Promise.all([
    db.select().from(projectPaymentsTable),
    db.select().from(appSettingsTable),
  ]);
  const issues: DataIssue[] = [];
  const projectIds = new Set(d.projects.map((p) => p.id));

  for (const p of d.projects) {
    const logged = payments.filter((x) => x.projectId === p.id).reduce((s, x) => s + Number(x.amount), 0);
    const paid = Number(p.paidAmount);
    if (Math.abs(paid - logged) >= 0.01) {
      issues.push({ key: "paid_mismatch", severity: "error", projectId: p.id, label: p.projectName, amount: r2(paid - logged), date: projectDate(p) });
    }
    if (p.status !== "Cancelled" && logged - Number(p.clientPrice) >= 0.01) {
      issues.push({ key: "client_overpaid", severity: "warning", projectId: p.id, label: p.projectName, amount: r2(logged - Number(p.clientPrice)), date: projectDate(p) });
    }
    if (p.status !== "Cancelled" && Number(p.clientPrice) <= 0) {
      issues.push({ key: "no_price", severity: "warning", projectId: p.id, label: p.projectName, amount: 0, date: projectDate(p) });
    }
    for (const m of d.payables.members(p)) {
      if (m.paid - m.commission >= 0.01) {
        issues.push({ key: "freelancer_overpaid", severity: "warning", projectId: p.id, label: `${m.freelancerName} — ${p.projectName}`, amount: r2(m.paid - m.commission), date: projectDate(p) });
      }
    }
  }
  for (const f of d.frPays) {
    if (f.projectId != null && !projectIds.has(f.projectId)) {
      issues.push({ key: "freelancer_payment_orphan", severity: "warning", projectId: null, label: f.name, amount: r2(f.amount), date: f.date });
    }
  }
  const future = [
    ...payments.filter((x) => projectIds.has(x.projectId)).map((x) => ({ date: (x.paidAt || x.createdAt.toISOString()).slice(0, 10), amount: Number(x.amount), projectId: x.projectId as number | null, label: d.projects.find((p) => p.id === x.projectId)?.projectName ?? "" })),
    ...d.frPays.map((f) => ({ date: f.date, amount: f.amount, projectId: f.projectId, label: f.name })),
    ...d.exps.map((e) => ({ date: e.date, amount: e.amount, projectId: null, label: e.category })),
  ].filter((x) => x.date > d.today);
  for (const x of future) issues.push({ key: "future_date", severity: "info", projectId: x.projectId, label: x.label, amount: r2(x.amount), date: x.date });

  const bs = balanceSheet(d, d.today);
  if (bs.assets.cash < -0.005) {
    issues.push({ key: "negative_cash", severity: "warning", projectId: null, label: "", amount: bs.assets.cash, date: d.today });
  }
  if (Math.abs(bs.difference) >= 0.01) {
    issues.push({ key: "not_balanced", severity: "error", projectId: null, label: "", amount: bs.difference, date: d.today });
  }

  let corrections: unknown[] = [];
  try { corrections = JSON.parse(settings.find((s) => s.key === "payments_reconciliation")?.value ?? "[]"); } catch { corrections = []; }
  return { checkedAt: new Date().toISOString(), issues, corrections };
}
