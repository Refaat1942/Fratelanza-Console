import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable, projectsTable, projectPaymentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { cashReceipts, inRange, pct, projectDate, projectFigures } from "../lib/financials.js";

const router: IRouter = Router();

function toShape(r: typeof expensesTable.$inferSelect) {
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    date: r.date,
  };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(sql`date >= ${startDate}`);
  if (endDate) conditions.push(sql`date <= ${endDate}`);

  const rows = conditions.length
    ? await db.select().from(expensesTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(expensesTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toShape));
});

router.get("/expenses/summary", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(sql`date >= ${startDate}`);
  if (endDate) conditions.push(sql`date <= ${endDate}`);

  const [agg] = conditions.length
    ? await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
        count: sql<number>`count(*)`,
      }).from(expensesTable).where(and(...conditions))
    : await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
        count: sql<number>`count(*)`,
      }).from(expensesTable);

  res.json({
    totalExpenses: Number(agg?.totalExpenses ?? 0),
    count: Number(agg?.count ?? 0),
  });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.insert(expensesTable).values({
    description: body.description,
    amount: String(Number(body.amount ?? 0)),
    date: body.date ?? today,
  }).returning();
  res.status(201).json(toShape(row));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/finance/report", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const expConditions = [];
  if (startDate) expConditions.push(sql`date >= ${startDate}`);
  if (endDate) expConditions.push(sql`date <= ${endDate}`);

  const allProjects = await db.select().from(projectsTable).orderBy(sql`date desc`);
  const payments = await db.select().from(projectPaymentsTable);
  const expenses = expConditions.length
    ? await db.select().from(expensesTable).where(and(...expConditions))
    : await db.select().from(expensesTable);

  // Projects are booked in the period they start (start date, else creation date)
  const projects = allProjects.filter((p) => inRange(projectDate(p), startDate, endDate));
  // Cash is counted when it was actually received, whichever project it belongs to
  const receipts = cashReceipts(allProjects, payments).filter((r) => inRange(r.date, startDate, endDate));

  let totalRemaining = 0;
  let totalCost = 0;
  let totalContractValue = 0;
  let projectProfit = 0;
  for (const p of projects) {
    const f = projectFigures(p);
    totalRemaining += f.receivable;
    totalCost += f.cost;
    totalContractValue += f.contractValue;
    projectProfit += f.expectedProfit;
  }
  const totalPaid = receipts.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Gross margin = contract value - project costs (freelancers + direct), before overheads
  const grossMargin = projectProfit;
  // Expected net profit = gross margin - operating expenses (once all balances are collected)
  const expectedNetProfit = grossMargin - totalExpenses;
  // Cash net profit = cash received in period - project costs - operating expenses
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

  res.json({
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
    monthly,
    remainingBreakdown,
    projects: projects.map((r) => ({
      id: r.id,
      type: r.type,
      projectName: r.projectName,
      clientName: r.clientName,
      clientPrice: Number(r.clientPrice),
      totalCost: Number(r.totalCost),
      netProfit: projectFigures(r).expectedProfit,
      freelancerName: r.freelancerName,
      freelancerCommission: Number(r.freelancerCommission),
      startDate: r.startDate,
      deadline: r.deadline,
      status: r.status,
      paidAmount: Number(r.paidAmount),
      remainingAmount: projectFigures(r).receivable,
      nextPaymentDate: r.nextPaymentDate,
      notes: r.notes,
      date: r.date.toISOString(),
    })),
  });
});

export default router;
