import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function toShape(r: typeof tasksTable.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    projectId: r.projectId,
    projectName: r.projectName,
    assignedTo: r.assignedTo,
    dueDate: r.dueDate,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const { status, projectId } = req.query as Record<string, string>;
  const conditions = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (projectId) conditions.push(eq(tasksTable.projectId, parseInt(projectId, 10)));

  const rows = conditions.length
    ? await db.select().from(tasksTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(tasksTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toShape));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const [row] = await db.insert(tasksTable).values({
    title: body.title,
    description: body.description ?? null,
    status: body.status ?? "Todo",
    priority: body.priority ?? "Medium",
    projectId: body.projectId ?? null,
    projectName: body.projectName ?? null,
    assignedTo: body.assignedTo ?? null,
    dueDate: body.dueDate ?? null,
  }).returning();
  res.status(201).json(toShape(row));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Record<string, string | number | null | undefined> = {};
  const textFields = ["title", "description", "status", "priority", "projectName", "assignedTo", "dueDate"];
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.projectId !== undefined) updates.projectId = body.projectId === null ? null : Number(body.projectId);

  const [row] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(tasksTable).where(eq(tasksTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
