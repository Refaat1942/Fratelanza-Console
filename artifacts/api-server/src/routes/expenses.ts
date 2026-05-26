import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable, projectsTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";

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
  const projConditions = [];
  const expConditions = [];
  if (startDate) {
    projConditions.push(sql`date::date >= ${startDate}::date`);
    expConditions.push(sql`date >= ${startDate}`);
  }
  if (endDate) {
    projConditions.push(sql`date::date <= ${endDate}::date`);
    expConditions.push(sql`date <= ${endDate}`);
  }

  const projects = projConditions.length
    ? await db.select().from(projectsTable).where(and(...projConditions)).orderBy(sql`date desc`)
    : await db.select().from(projectsTable).orderBy(sql`date desc`);

  const [expAgg] = expConditions.length
    ? await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
      }).from(expensesTable).where(and(...expConditions))
    : await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
      }).from(expensesTable);

  const totalPaid = projects.reduce((s, p) => s + Number(p.paidAmount), 0);
  const totalRemaining = projects.reduce((s, p) => s + Number(p.remainingAmount), 0);
  const totalCost = projects.reduce((s, p) => s + Number(p.totalCost), 0);
  const totalExpenses = Number(expAgg?.totalExpenses ?? 0);
  // Gross revenue = paid only. Net profit = gross revenue - expenses.
  const totalRevenue = totalPaid;
  const totalNetProfit = totalRevenue - totalExpenses;
  const netBalance = totalNetProfit;
  const remainingBreakdown = projects
    .filter((p) => Number(p.remainingAmount) > 0)
    .sort((a, b) => Number(b.remainingAmount) - Number(a.remainingAmount))
    .map((p) => ({
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName ?? "",
      remaining: Number(p.remainingAmount),
    }));

  res.json({
    totalRevenue,
    totalPaid,
    totalRemaining,
    totalCost,
    totalNetProfit,
    totalExpenses,
    netBalance,
    remainingBreakdown,
    projects: projects.map((r) => ({
      id: r.id,
      type: r.type,
      projectName: r.projectName,
      clientName: r.clientName,
      clientPrice: Number(r.clientPrice),
      totalCost: Number(r.totalCost),
      netProfit: Number(r.netProfit),
      freelancerName: r.freelancerName,
      freelancerCommission: Number(r.freelancerCommission),
      startDate: r.startDate,
      deadline: r.deadline,
      status: r.status,
      paidAmount: Number(r.paidAmount),
      remainingAmount: Number(r.remainingAmount),
      nextPaymentDate: r.nextPaymentDate,
      notes: r.notes,
      date: r.date.toISOString(),
    })),
  });
});

export default router;
