import { db, projectsTable, projectPaymentsTable, expensesTable, projectTeamTable, freelancerPaymentsTable } from "@workspace/db";
import { and, sql } from "drizzle-orm";

type ProjectRow = typeof projectsTable.$inferSelect;
type PaymentRow = typeof projectPaymentsTable.$inferSelect;
type TeamRow = typeof projectTeamTable.$inferSelect;
type FreelancerPaymentRow = typeof freelancerPaymentsTable.$inferSelect;

export const nameKey = (n: string | null | undefined) => (n ?? "").trim().toLowerCase();

/** Each freelancer's commission on a project (lead + team, one entry per name). */
export function projectCommitments(p: ProjectRow, teamRows: TeamRow[]) {
  const out: { name: string; displayName: string; commission: number }[] = [];
  const seen = new Set<string>();
  if (p.freelancerName) {
    seen.add(nameKey(p.freelancerName));
    out.push({ name: nameKey(p.freelancerName), displayName: p.freelancerName, commission: Number(p.freelancerCommission) });
  }
  for (const t of teamRows) {
    if (t.projectId !== p.id || seen.has(nameKey(t.freelancerName))) continue;
    seen.add(nameKey(t.freelancerName));
    out.push({ name: nameKey(t.freelancerName), displayName: t.freelancerName, commission: Number(t.commission) });
  }
  return out;
}

/**
 * Freelancer money per project, from the payments recorded in the Projects tab.
 * - costPaid: money actually paid out for the project (freelancer payments + other costs)
 * - owed: commissions not paid yet
 * Payments without a project (opening balances such as a salary) are not project costs.
 */
export function freelancerPayables(allProjects: ProjectRow[], team: TeamRow[], payments: FreelancerPaymentRow[]) {
  const paidByProject = new Map<number, number>();
  const paidByProjectName = new Map<string, number>();
  const paidByName = new Map<string, number>();
  for (const pay of payments) {
    const amount = Number(pay.amount);
    const name = nameKey(pay.freelancerName);
    paidByName.set(name, (paidByName.get(name) ?? 0) + amount);
    if (pay.projectId == null) continue;
    paidByProject.set(pay.projectId, (paidByProject.get(pay.projectId) ?? 0) + amount);
    const k = `${pay.projectId}|${name}`;
    paidByProjectName.set(k, (paidByProjectName.get(k) ?? 0) + amount);
  }

  const commitmentsByProject = new Map<number, ReturnType<typeof projectCommitments>>();
  const byFreelancer = new Map<string, { commissions: number; owed: number }>();
  for (const p of allProjects) {
    const list = projectCommitments(p, team);
    commitmentsByProject.set(p.id, list);
    for (const c of list) {
      const owed = Math.max(0, c.commission - (paidByProjectName.get(`${p.id}|${c.name}`) ?? 0));
      const cur = byFreelancer.get(c.name) ?? { commissions: 0, owed: 0 };
      cur.commissions += c.commission;
      cur.owed += owed;
      byFreelancer.set(c.name, cur);
    }
  }

  const commissionsFor = (p: ProjectRow) => (commitmentsByProject.get(p.id) ?? []).reduce((s, c) => s + c.commission, 0);
  return {
    /** Freelancer commissions on the project */
    commissions: commissionsFor,
    /** Non-freelancer project costs (the "Other costs" field) */
    otherCosts(p: ProjectRow) {
      return Math.max(0, Number(p.totalCost) - commissionsFor(p));
    },
    freelancerPaid(p: ProjectRow) {
      return paidByProject.get(p.id) ?? 0;
    },
    /** Project cost actually paid out: other costs + money given to freelancers */
    costPaid(p: ProjectRow) {
      return this.otherCosts(p) + this.freelancerPaid(p);
    },
    owedForProject(p: ProjectRow) {
      return (commitmentsByProject.get(p.id) ?? []).reduce(
        (s, c) => s + Math.max(0, c.commission - (paidByProjectName.get(`${p.id}|${c.name}`) ?? 0)), 0);
    },
    /** Per member of a project: commission, paid, owed */
    members(p: ProjectRow) {
      return (commitmentsByProject.get(p.id) ?? []).map((c) => {
        const paid = paidByProjectName.get(`${p.id}|${c.name}`) ?? 0;
        return { freelancerName: c.displayName, commission: c.commission, paid, owed: Math.max(0, c.commission - paid) };
      });
    },
    forFreelancer(name: string) {
      const f = byFreelancer.get(nameKey(name)) ?? { commissions: 0, owed: 0 };
      return { totalCommission: f.commissions, paid: paidByName.get(nameKey(name)) ?? 0, owed: f.owed };
    },
  };
}

export async function loadFreelancerPayables(allProjects?: ProjectRow[]) {
  const projects = allProjects ?? await db.select().from(projectsTable);
  const team = await db.select().from(projectTeamTable);
  const payments = await db.select().from(freelancerPaymentsTable);
  return freelancerPayables(projects, team, payments);
}

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

  const payables = await loadFreelancerPayables(allProjects);
  const freelancerPaymentsInPeriod = (await db.select().from(freelancerPaymentsTable))
    .filter((f) => f.projectId != null)
    .map((f) => ({ date: (f.paidAt || f.createdAt.toISOString()).slice(0, 10), amount: Number(f.amount) }))
    .filter((f) => inRange(f.date, startDate, endDate));

  let totalRemaining = 0;
  let totalCost = 0;
  let totalCostPaid = 0;
  let freelancerOwed = 0;
  let totalContractValue = 0;
  let grossMargin = 0;
  for (const p of projects) {
    const f = projectFigures(p);
    totalRemaining += f.receivable;
    totalCost += f.cost;
    totalCostPaid += payables.otherCosts(p);
    freelancerOwed += payables.owedForProject(p);
    totalContractValue += f.contractValue;
    grossMargin += f.expectedProfit;
  }
  const totalPaid = receipts.reduce((s, r) => s + r.amount, 0);
  // Money given to freelancers counts on the day it was paid (any project)
  totalCostPaid += freelancerPaymentsInPeriod.reduce((s, f) => s + f.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  // Fratelanza estimated profit (until collection) = deals - project costs - expenses
  const expectedNetProfit = grossMargin - totalExpenses;
  // Cash result = cash received - project costs actually paid out - expenses
  const totalNetProfit = totalPaid - totalCostPaid - totalExpenses;

  const months = new Map<string, { collected: number; cost: number; expenses: number }>();
  const bucket = (date: string) => {
    const key = date.slice(0, 7);
    const cur = months.get(key) ?? { collected: 0, cost: 0, expenses: 0 };
    months.set(key, cur);
    return cur;
  };
  for (const r of receipts) bucket(r.date).collected += r.amount;
  for (const p of projects) bucket(projectDate(p)).cost += payables.otherCosts(p);
  for (const f of freelancerPaymentsInPeriod) bucket(f.date).cost += f.amount;
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
      totalCostPaid,
      freelancerOwed,
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
