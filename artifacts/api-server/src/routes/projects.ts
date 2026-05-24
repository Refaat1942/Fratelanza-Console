import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { freelancerPaymentTermsTable, projectReceivablesTable, projectsTable, projectTeamTable } from "@workspace/db";
import { eq, sql, and, ilike, isNull, not } from "drizzle-orm";

const router: IRouter = Router();

function positiveMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

type ReceivableInput = { amount?: unknown; dueDate?: unknown; note?: unknown; status?: unknown; paidAt?: unknown };
type FreelancerPaymentInput = ReceivableInput & { freelancerName?: unknown };

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeTermStatus(value: unknown): string {
  const status = String(value ?? "Pending").trim();
  return status === "Paid" ? "Paid" : "Pending";
}

function toReceivableShape(r: typeof projectReceivablesTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    amount: Number(r.amount),
    dueDate: r.dueDate,
    note: r.note,
    status: r.status,
    paidAt: r.paidAt,
  };
}

function toFreelancerPaymentShape(r: typeof freelancerPaymentTermsTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    freelancerName: r.freelancerName,
    amount: Number(r.amount),
    dueDate: r.dueDate,
    note: r.note,
    status: r.status,
    paidAt: r.paidAt,
  };
}

function receivableValues(projectId: number, rows: ReceivableInput[]) {
  return rows
    .map((row) => ({
      projectId,
      amount: String(positiveMoney(row.amount)),
      dueDate: cleanText(row.dueDate),
      note: cleanText(row.note),
      status: normalizeTermStatus(row.status),
      paidAt: cleanText(row.paidAt),
    }))
    .filter((row) => Number(row.amount) > 0);
}

function freelancerPaymentValues(projectId: number, rows: FreelancerPaymentInput[]) {
  return rows
    .map((row) => ({
      projectId,
      freelancerName: cleanText(row.freelancerName) ?? "",
      amount: String(positiveMoney(row.amount)),
      dueDate: cleanText(row.dueDate),
      note: cleanText(row.note),
      status: normalizeTermStatus(row.status),
      paidAt: cleanText(row.paidAt),
    }))
    .filter((row) => row.freelancerName && Number(row.amount) > 0);
}

async function replaceProjectTerms(projectId: number, clientReceivables: unknown, freelancerPaymentTerms: unknown): Promise<void> {
  if (Array.isArray(clientReceivables)) {
    await db.delete(projectReceivablesTable).where(eq(projectReceivablesTable.projectId, projectId));
    const values = receivableValues(projectId, clientReceivables as ReceivableInput[]);
    if (values.length > 0) await db.insert(projectReceivablesTable).values(values);
  }
  if (Array.isArray(freelancerPaymentTerms)) {
    await db.delete(freelancerPaymentTermsTable).where(eq(freelancerPaymentTermsTable.projectId, projectId));
    const values = freelancerPaymentValues(projectId, freelancerPaymentTerms as FreelancerPaymentInput[]);
    if (values.length > 0) await db.insert(freelancerPaymentTermsTable).values(values);
  }
}

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
  const { team, clientReceivables, freelancerPaymentTerms, ...body } = req.body ?? {};
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
    freelancerCommission: String(positiveMoney(body.freelancerCommission)),
  };

  const [project] = await db.insert(projectsTable).values(values).returning();

  if (Array.isArray(team)) {
    const commissionedTeam = team.filter((m: { freelancerName: string; commission: number }) => positiveMoney(m.commission) > 0);
    if (commissionedTeam.length > 0) {
      await db.insert(projectTeamTable).values(
        commissionedTeam.map((m: { freelancerName: string; commission: number }) => ({
          projectId: project.id,
          freelancerName: m.freelancerName,
          commission: String(positiveMoney(m.commission)),
        }))
      );
    }
  }

  await replaceProjectTerms(project.id, clientReceivables, freelancerPaymentTerms);

  res.status(201).json(toProjectShape(project));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [team, clientReceivables, freelancerPaymentTerms] = await Promise.all([
    db.select().from(projectTeamTable).where(eq(projectTeamTable.projectId, id)),
    db.select().from(projectReceivablesTable).where(eq(projectReceivablesTable.projectId, id)).orderBy(projectReceivablesTable.dueDate),
    db.select().from(freelancerPaymentTermsTable).where(eq(freelancerPaymentTermsTable.projectId, id)).orderBy(freelancerPaymentTermsTable.dueDate),
  ]);
  res.json({
    ...toProjectShape(project),
    team: team.map(toTeamShape),
    clientReceivables: clientReceivables.map(toReceivableShape),
    freelancerPaymentTerms: freelancerPaymentTerms.map(toFreelancerPaymentShape),
  });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { team, clientReceivables, freelancerPaymentTerms, ...body } = req.body ?? {};

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
    updates.freelancerCommission = String(positiveMoney(body.freelancerCommission));
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
    const commissionedTeam = team.filter((m: { freelancerName: string; commission: number }) => positiveMoney(m.commission) > 0);
    if (commissionedTeam.length > 0) {
      await db.insert(projectTeamTable).values(
        commissionedTeam.map((m: { freelancerName: string; commission: number }) => ({
          projectId: id,
          freelancerName: m.freelancerName,
          commission: String(positiveMoney(m.commission)),
        }))
      );
    }
  }

  await replaceProjectTerms(id, clientReceivables, freelancerPaymentTerms);

  res.json(toProjectShape(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(freelancerPaymentTermsTable).where(eq(freelancerPaymentTermsTable.projectId, id));
  await db.delete(projectReceivablesTable).where(eq(projectReceivablesTable.projectId, id));
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


router.get("/projects/:id/payment-terms", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [clientReceivables, freelancerPaymentTerms] = await Promise.all([
    db.select().from(projectReceivablesTable).where(eq(projectReceivablesTable.projectId, id)).orderBy(projectReceivablesTable.dueDate),
    db.select().from(freelancerPaymentTermsTable).where(eq(freelancerPaymentTermsTable.projectId, id)).orderBy(freelancerPaymentTermsTable.dueDate),
  ]);
  res.json({
    clientReceivables: clientReceivables.map(toReceivableShape),
    freelancerPaymentTerms: freelancerPaymentTerms.map(toFreelancerPaymentShape),
  });
});

router.get("/projects/:id/team", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const team = await db.select().from(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  res.json(team.map(toTeamShape));
});

router.post("/projects/:id/team", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { freelancerName, commission } = req.body ?? {};
  const parsedCommission = positiveMoney(commission);
  if (parsedCommission <= 0) {
    res.status(400).json({ error: "Commission must be greater than 0" });
    return;
  }
  const [member] = await db.insert(projectTeamTable).values({
    projectId: id,
    freelancerName,
    commission: String(parsedCommission),
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
