import { db, projectsTable, projectPaymentsTable, expensesTable } from "@workspace/db";
import { and, sql } from "drizzle-orm";

type ProjectRow = typeof projectsTable.$inferSelect;
type PaymentRow = typeof projectPaymentsTable.$inferSelect;

/**
 * Single source of truth for per-project money figures, so the dashboard,
 * finance report, receivables and charts all agree.
 *
 * - `totalCost` already includes every freelancer commission plus direct costs
 *   (the project form adds them together before saving).
 * - A Cancelled project's unpaid balance will never be collected, so it is not
 *   a receivable and its earnable value is only what the client actually paid.
 */
export function projectFigures(p: Pick<ProjectRow, "clientPrice" | "totalCost" | "paidAmount" | "status">) {
  const price = Number(p.clientPrice);
  const cost = Number(p.totalCost);
  const paid = Number(p.paidAmount);
  const cancelled = p.status === "Cancelled";
  const contractValue = cancelled ? paid : price;
  return {
    contractValue,
    cost,
    paid,
    receivable: cancelled ? 0 : Math.max(0, price - paid),
    /** Profit this project makes once everything owed is collected */
    expectedProfit: contractValue - cost,
  };
}

export function isReceivable(p: Pick<ProjectRow, "clientPrice" | "totalCost" | "paidAmount" | "status">) {
  return projectFigures(p).receivable > 0;
}

/** Derived columns that must always be recomputed server-side from price/cost/paid. */
export function derivedProjectColumns(price: number, cost: number, paid: number) {
  return {
    netProfit: String(price - cost),
    remainingAmount: String(Math.max(0, price - paid)),
  };
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/**
 * Cash received per project, dated. Logged payments carry their own date.
 * Any part of `paidAmount` without a payment record (legacy data or a manually
 * edited paid amount) is dated at the project's start/creation date.
 */
export function cashReceipts(projects: ProjectRow[], payments: PaymentRow[]) {
  const loggedByProject = new Map<number, number>();
  const receipts: { projectId: number; date: string; amount: number }[] = [];
  const projectIds = new Set(projects.map((p) => p.id));

  for (const pay of payments) {
    if (!projectIds.has(pay.projectId)) continue;
    const amount = Number(pay.amount);
    loggedByProject.set(pay.projectId, (loggedByProject.get(pay.projectId) ?? 0) + amount);
    receipts.push({
      projectId: pay.projectId,
      date: (pay.paidAt || pay.createdAt.toISOString()).slice(0, 10),
      amount,
    });
  }

  for (const p of projects) {
    const logged = loggedByProject.get(p.id) ?? 0;
    const paid = Number(p.paidAmount);
    const unlogged = paid - logged;
    if (Math.abs(unlogged) > 0.005) {
      receipts.push({ projectId: p.id, date: projectDate(p), amount: unlogged });
    }
  }
  return receipts;
}

/** Date a project is booked on: its start date if set, otherwise when it was recorded. */
export function projectDate(p: Pick<ProjectRow, "startDate" | "date">) {
  const start = (p.startDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : p.date.toISOString().slice(0, 10);
}

export function inRange(date: string, startDate?: string, endDate?: string) {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

/**
 * All money figures for a period. Projects are booked by start date (else
 * creation date), cash on the day it was received, expenses on their date.
 * No dates = all time.
 */
export async function periodFinancials(startDate?: string, endDate?: string) {
  const expConditions = [];
  if (startDate) expConditions.push(sql`date >= ${startDate}`);
  if (endDate) expConditions.push(sql`date <= ${endDate}`);

  const allProjects = await db.select().from(projectsTable).orderBy(sql`date desc`);
  const payments = await db.select().from(projectPaymentsTable);
  const expenses = expConditions.length
    ? await db.select().from(expensesTable).where(and(...expConditions))
    : await db.select().from(expensesTable);

  const projects = allProjects.filter((p) => inRange(projectDate(p), startDate, endDate));
  const receipts = cashReceipts(allProjects, payments).filter((r) => inRange(r.date, startDate, endDate));

  let totalRemaining = 0;
  let totalCost = 0;
  let totalContractValue = 0;
  let grossMargin = 0;
  for (const p of projects) {
    const f = projectFigures(p);
    totalRemaining += f.receivable;
    totalCost += f.cost;
    totalContractValue += f.contractValue;
    grossMargin += f.expectedProfit;
  }
  const totalPaid = receipts.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  // Fratelanza estimated profit (until collection) = deals - project costs - expenses
  const expectedNetProfit = grossMargin - totalExpenses;
  // Cash result = cash received - project costs - expenses
  const totalNetProfit = totalPaid - totalCost - totalExpenses;

  const months = new Map<string, { collected: number; cost: number; expenses: number }>();
  const bucket = (date: string) => {
    const key = date.slice(0, 7);
    const cur = months.get(key) ?? { collected: 0, cost: 0, expenses: 0 };
    months.set(key, cur);
    return cur;
  };
  for (const r of receipts) bucket(r.date).collected += r.amount;
  for (const p of projects) bucket(projectDate(p)).cost += Number(p.totalCost);
  for (const e of expenses) bucket((e.date ?? e.createdAt.toISOString()).slice(0, 10)).expenses += Number(e.amount);
  const monthly = [...months.entries()]
    .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.collected - v.cost - v.expenses }));

  const remainingBreakdown = projects
    .map((p) => ({ p, remaining: projectFigures(p).receivable }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .map(({ p, remaining }) => ({
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName ?? "",
      remaining,
    }));

  return {
    projects,
    totals: {
      totalRevenue: totalPaid,
      totalPaid,
      totalRemaining,
      totalCost,
      totalContractValue,
      grossMargin,
      grossMarginPct: pct(grossMargin, totalContractValue),
      expectedNetProfit,
      netMarginPct: pct(expectedNetProfit, totalContractValue),
      totalNetProfit,
      totalExpenses,
      netBalance: totalNetProfit,
    },
    monthly,
    remainingBreakdown,
  };
}
