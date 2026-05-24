import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { templatesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function toShape(r: typeof templatesTable.$inferSelect) {
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    cost: Number(r.cost),
    expenses: Number(r.expenses),
    multiplier: Number(r.multiplier),
    broker: Number(r.broker),
    students: r.students,
  };
}

router.get("/templates", async (req, res): Promise<void> => {
  const { category } = req.query as Record<string, string>;
  const rows = category
    ? await db.select().from(templatesTable).where(eq(templatesTable.category, category)).orderBy(templatesTable.name)
    : await db.select().from(templatesTable).orderBy(templatesTable.name);
  res.json(rows.map(toShape));
});

router.post("/templates", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const [row] = await db.insert(templatesTable).values({
    category: body.category ?? "Software",
    name: body.name,
    cost: String(Number(body.cost ?? 0)),
    expenses: String(Number(body.expenses ?? 0)),
    multiplier: String(Number(body.multiplier ?? 1)),
    broker: String(Number(body.broker ?? 0)),
    students: Number(body.students ?? 0),
  }).returning();
  res.status(201).json(toShape(row));
});

router.patch("/templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Record<string, string | number | undefined> = {};
  if (body.category !== undefined) updates.category = body.category;
  if (body.name !== undefined) updates.name = body.name;
  if (body.cost !== undefined) updates.cost = String(Number(body.cost));
  if (body.expenses !== undefined) updates.expenses = String(Number(body.expenses));
  if (body.multiplier !== undefined) updates.multiplier = String(Number(body.multiplier));
  if (body.broker !== undefined) updates.broker = String(Number(body.broker));
  if (body.students !== undefined) updates.students = Number(body.students);

  const [row] = await db.update(templatesTable).set(updates).where(eq(templatesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(templatesTable).where(eq(templatesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
