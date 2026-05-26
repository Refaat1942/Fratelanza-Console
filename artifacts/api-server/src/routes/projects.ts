import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, projectTeamTable } from "@workspace/db";
import { eq, sql, and, ilike, isNull, not } from "drizzle-orm";

const router: IRouter = Router();

function toProjectShape(r: typeof projectsTable.$inferSelect) {
  return {
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
  };
}

function toTeamShape(t: typeof projectTeamTable.$inferSelect) {
  return {
    id: t.id,
    projectId: t.projectId,
    freelancerName: t.freelancerName,
    commission: Number(t.commission),
  };
}

router.get("/projects", async (req, res): Promise<void> => {
  const { type, status, search } = req.query as Record<string, string>;
  const conditions = [];
  if (type) conditions.push(eq(projectsTable.type, type));
  if (status) conditions.push(eq(projectsTable.status, status));
  if (search) conditions.push(ilike(projectsTable.projectName, `%${search}%`));

  const rows = conditions.length
    ? await db.select().from(projectsTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(projectsTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toProjectShape));
});

router.get("/projects/receivables", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(projectsTable)
    .where(sql`remaining_amount::numeric > 0`)
    .orderBy(projectsTable.nextPaymentDate);
  res.json(rows.map(toProjectShape));
});

router.post("/projects", async (req, res): Promise<void> => {
  const { team, ...body } = req.body ?? {};
  const price = Number(body.clientPrice ?? 0);
  const cost = Number(body.totalCost ?? 0);
  const paid = Number(body.paidAmount ?? 0);

  const values = {
    ...body,
    clientPrice: String(price),
    totalCost: String(cost),
    netProfit: String(price - cost),
    paidAmount: String(paid),
    remainingAmount: String(price - paid),
    freelancerCommission: String(Number(body.freelancerCommission ?? 0)),
  };

  const [project] = await db.insert(projectsTable).values(values).returning();

  if (Array.isArray(team) && team.length > 0) {
    await db.insert(projectTeamTable).values(
      team.map((m: { freelancerName: string; commission: number }) => ({
        projectId: project.id,
        freelancerName: m.freelancerName,
        commission: String(m.commission),
      }))
    );
  }

  res.status(201).json(toProjectShape(project));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const team = await db.select().from(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  res.json({ ...toProjectShape(project), team: team.map(toTeamShape) });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { team, ...body } = req.body ?? {};

  const updates: Record<string, string | undefined> = {};
  if (body.clientPrice !== undefined) {
    const price = Number(body.clientPrice);
    const cost = Number(body.totalCost ?? 0);
    updates.clientPrice = String(price);
    updates.netProfit = String(price - cost);
  }
  if (body.totalCost !== undefined) {
    const price = Number(body.clientPrice ?? 0);
    const cost = Number(body.totalCost);
    updates.totalCost = String(cost);
    updates.netProfit = String(price - cost);
  }
  if (body.paidAmount !== undefined) {
    const paid = Number(body.paidAmount);
    updates.paidAmount = String(paid);
  }
  if (body.remainingAmount !== undefined) {
    updates.remainingAmount = String(Number(body.remainingAmount));
  }
  if (body.freelancerCommission !== undefined) {
    updates.freelancerCommission = String(Number(body.freelancerCommission));
  }

  const textFields = ["projectName", "clientName", "freelancerName", "startDate", "deadline", "status", "nextPaymentDate", "notes"];
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  const [project] = await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.id, id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (Array.isArray(team)) {
    await db.delete(projectTeamTable).where(eq(projectTeamTable.projectId, id));
    if (team.length > 0) {
      await db.insert(projectTeamTable).values(
        team.map((m: { freelancerName: string; commission: number }) => ({
          projectId: id,
          freelancerName: m.freelancerName,
          commission: String(m.commission),
        }))
      );
    }
  }

  res.json(toProjectShape(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/projects/:id/payment", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, nextPaymentDate } = req.body ?? {};

  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const newPaid = Number(existing.paidAmount) + Number(amount);
  const newRemaining = Number(existing.clientPrice) - newPaid;
  const updates: Record<string, string> = {
    paidAmount: String(newPaid),
    remainingAmount: String(newRemaining < 0 ? 0 : newRemaining),
  };
  if (nextPaymentDate) updates.nextPaymentDate = nextPaymentDate;

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
  res.json(toProjectShape(updated));
});

router.get("/projects/:id/team", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const team = await db.select().from(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  res.json(team.map(toTeamShape));
});

router.post("/projects/:id/team", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { freelancerName, commission } = req.body ?? {};
  const [member] = await db.insert(projectTeamTable).values({
    projectId: id,
    freelancerName,
    commission: String(Number(commission ?? 0)),
  }).returning();
  res.status(201).json(toTeamShape(member));
});

router.delete("/projects/:id/team/:memberId", async (req, res): Promise<void> => {
  const memberId = parseInt(Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId, 10);
  const [deleted] = await db.delete(projectTeamTable).where(eq(projectTeamTable.id, memberId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
