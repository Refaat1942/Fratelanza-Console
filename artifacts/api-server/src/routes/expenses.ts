import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { periodFinancials, projectFigures } from "../lib/financials.js";

const router: IRouter = Router();

/** Company expense categories. Freelancer payments are NOT expenses: they are recorded on projects. */
export const EXPENSE_CATEGORIES = [
  "rent", "salaries", "marketing", "sales", "software", "utilities", "transport",
  "office", "equipment", "taxes", "bank_fees", "other",
] as const;
const CATEGORY_SET = new Set<string>(EXPENSE_CATEGORIES);
const normCategory = (c: unknown) => (CATEGORY_SET.has(String(c)) ? String(c) : "other");

function toShape(r: typeof expensesTable.$inferSelect) {
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    date: r.date,
    category: r.category,
  };
}

function expenseConditions(q: Record<string, string>) {
  const conditions = [];
  if (q.startDate) conditions.push(sql`date >= ${q.startDate}`);
  if (q.endDate) conditions.push(sql`date <= ${q.endDate}`);
  if (q.category && CATEGORY_SET.has(q.category)) conditions.push(eq(expensesTable.category, q.category));
  return conditions;
}

router.get("/expenses", async (req, res): Promise<void> => {
  const conditions = expenseConditions(req.query as Record<string, string>);
  const rows = conditions.length
    ? await db.select().from(expensesTable).where(and(...conditions)).orderBy(sql`date desc nulls last, created_at desc`)
    : await db.select().from(expensesTable).orderBy(sql`date desc nulls last, created_at desc`);

  res.json(rows.map(toShape));
});

router.get("/expenses/summary", async (req, res): Promise<void> => {
  const conditions = expenseConditions(req.query as Record<string, string>);
  const rows = conditions.length
    ? await db.select().from(expensesTable).where(and(...conditions))
    : await db.select().from(expensesTable);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const cur = byCategory.get(r.category) ?? { total: 0, count: 0 };
    cur.total += Number(r.amount);
    cur.count += 1;
    byCategory.set(r.category, cur);
  }

  res.json({
    totalExpenses: rows.reduce((s, r) => s + Number(r.amount), 0),
    count: rows.length,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((x, y) => y.total - x.total),
  });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.insert(expensesTable).values({
    description: body.description,
    amount: String(Number(body.amount ?? 0)),
    date: body.date ?? today,
    category: normCategory(body.category),
  }).returning();
  res.status(201).json(toShape(row));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Partial<typeof expensesTable.$inferInsert> = {};
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.amount !== undefined) updates.amount = String(Number(body.amount));
  if (body.date !== undefined) updates.date = body.date;
  if (body.category !== undefined) updates.category = normCategory(body.category);
  const [row] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(toShape(row));
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
