import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { periodFinancials, projectFigures } from "../lib/financials.js";

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
  const { projects, totals, monthly, remainingBreakdown } = await periodFinancials(startDate || undefined, endDate || undefined);

  res.json({
    ...totals,
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
