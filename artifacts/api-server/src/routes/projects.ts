import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { projectsTable, projectTeamTable, projectPaymentsTable, quotesTable } from "@workspace/db";
import { eq, sql, and, ilike, inArray, desc } from "drizzle-orm";
import { extractTextFromUpload } from "../lib/document-parser.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PAYMENT_METHODS = new Set(["bank_transfer", "vodafone_cash", "instapay", "check"]);

function toPaymentShape(r: typeof projectPaymentsTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    amount: Number(r.amount),
    paymentMethod: r.paymentMethod,
    paidAt: r.paidAt,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

function toProjectShape(
  r: typeof projectsTable.$inferSelect,
  teamFreelancers: string[] = [],
) {
  const freelancers = [...new Set([
    ...(r.freelancerName ? [r.freelancerName] : []),
    ...teamFreelancers,
  ])];
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
    teamFreelancers: freelancers,
    startDate: r.startDate,
    deadline: r.deadline,
    status: r.status,
    paidAmount: Number(r.paidAmount),
    remainingAmount: Number(r.remainingAmount),
    nextPaymentDate: r.nextPaymentDate,
    notes: r.notes,
    technicalOutline: r.technicalOutline,
    outlineFileName: r.outlineFileName,
    hasOutlineFile: Boolean(r.outlineFileData),
    quoteId: r.quoteId,
    generatedReport: r.generatedReport,
    date: r.date.toISOString(),
  };
}

function toQuoteSummary(r: typeof quotesTable.$inferSelect) {
  return {
    id: r.id,
    clientName: r.clientName,
    projectName: r.projectName,
    price: Number(r.price),
    date: r.date,
    language: r.language,
    hasOutline: Boolean(r.technicalOutline),
    hasReport: Boolean(r.generatedReport),
  };
}

async function quotesForClient(clientName: string | null | undefined) {
  const name = (clientName ?? "").trim();
  if (!name) return [];
  return db
    .select()
    .from(quotesTable)
    .where(sql`lower(trim(${quotesTable.clientName})) = lower(trim(${name}))`)
    .orderBy(desc(quotesTable.createdAt));
}

function toTeamShape(t: typeof projectTeamTable.$inferSelect) {
  return {
    id: t.id,
    projectId: t.projectId,
    freelancerName: t.freelancerName,
    commission: Number(t.commission),
  };
}

async function teamMapForProjects(projectIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (projectIds.length === 0) return map;
  const teamRows = await db
    .select()
    .from(projectTeamTable)
    .where(inArray(projectTeamTable.projectId, projectIds));
  for (const row of teamRows) {
    const list = map.get(row.projectId) ?? [];
    list.push(row.freelancerName);
    map.set(row.projectId, list);
  }
  return map;
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

  const teamMap = await teamMapForProjects(rows.map((r) => r.id));
  res.json(rows.map((r) => toProjectShape(r, teamMap.get(r.id) ?? [])));
});

router.get("/projects/quotes-by-client", async (req, res): Promise<void> => {
  const clientName = String(req.query.clientName ?? "").trim();
  const rows = await quotesForClient(clientName);
  res.json(rows.map(toQuoteSummary));
});

router.get("/projects/receivables", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(projectsTable)
    .where(sql`remaining_amount::numeric > 0`)
    .orderBy(projectsTable.nextPaymentDate);
  const teamMap = await teamMapForProjects(rows.map((r) => r.id));
  res.json(rows.map((r) => toProjectShape(r, teamMap.get(r.id) ?? [])));
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
    quoteId: body.quoteId != null ? Number(body.quoteId) : undefined,
  };

  const [project] = await db.insert(projectsTable).values(values).returning();

  if (Array.isArray(team) && team.length > 0) {
    await db.insert(projectTeamTable).values(
      team.map((m: { freelancerName: string; commission: number }) => ({
        projectId: project.id,
        freelancerName: m.freelancerName,
        commission: String(m.commission),
      })),
    );
  }

  const teamMap = await teamMapForProjects([project.id]);
  res.status(201).json(toProjectShape(project, teamMap.get(project.id) ?? []));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const team = await db.select().from(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  const payments = await db
    .select()
    .from(projectPaymentsTable)
    .where(eq(projectPaymentsTable.projectId, id))
    .orderBy(sql`created_at desc`);
  const teamMap = await teamMapForProjects([id]);
  const linkedQuotes = await quotesForClient(project.clientName);
  let linkedQuote = null;
  if (project.quoteId) {
    const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, project.quoteId));
    if (q) linkedQuote = toQuoteSummary(q);
  }
  res.json({
    ...toProjectShape(project, teamMap.get(id) ?? []),
    team: team.map(toTeamShape),
    payments: payments.map(toPaymentShape),
    linkedQuotes: linkedQuotes.map(toQuoteSummary),
    linkedQuote,
  });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { team, ...body } = req.body ?? {};

  const updates: Record<string, string | number | null | undefined> = {};
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
    updates.paidAmount = String(Number(body.paidAmount));
  }
  if (body.remainingAmount !== undefined) {
    updates.remainingAmount = String(Number(body.remainingAmount));
  }
  if (body.freelancerCommission !== undefined) {
    updates.freelancerCommission = String(Number(body.freelancerCommission));
  }

  const textFields = [
    "projectName", "clientName", "freelancerName", "startDate", "deadline",
    "status", "nextPaymentDate", "notes", "technicalOutline", "generatedReport",
    "outlineFileName",
  ];
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.quoteId !== undefined) {
    updates.quoteId = body.quoteId === null ? null : Number(body.quoteId);
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
        })),
      );
    }
  }

  const teamMap = await teamMapForProjects([id]);
  res.json(toProjectShape(project, teamMap.get(id) ?? []));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(projectPaymentsTable).where(eq(projectPaymentsTable.projectId, id));
  await db.delete(projectTeamTable).where(eq(projectTeamTable.projectId, id));
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/projects/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const payments = await db
    .select()
    .from(projectPaymentsTable)
    .where(eq(projectPaymentsTable.projectId, id))
    .orderBy(sql`created_at desc`);
  res.json(payments.map(toPaymentShape));
});

router.post("/projects/:id/payment", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, nextPaymentDate, paymentMethod, paidAt, notes } = req.body ?? {};

  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const method = PAYMENT_METHODS.has(paymentMethod) ? paymentMethod : "bank_transfer";
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) {
    res.status(400).json({ error: "Payment amount must be greater than zero" });
    return;
  }

  await db.insert(projectPaymentsTable).values({
    projectId: id,
    amount: String(payAmount),
    paymentMethod: method,
    paidAt: paidAt ?? new Date().toISOString().slice(0, 10),
    notes: notes ?? null,
  });

  const newPaid = Number(existing.paidAmount) + payAmount;
  const newRemaining = Math.max(0, Number(existing.clientPrice) - newPaid);
  const updates: Record<string, string> = {
    paidAmount: String(newPaid),
    remainingAmount: String(newRemaining),
  };
  if (nextPaymentDate) updates.nextPaymentDate = nextPaymentDate;

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
  const payments = await db
    .select()
    .from(projectPaymentsTable)
    .where(eq(projectPaymentsTable.projectId, id))
    .orderBy(sql`created_at desc`);
  const teamMap = await teamMapForProjects([id]);
  res.json({
    project: toProjectShape(updated, teamMap.get(id) ?? []),
    payments: payments.map(toPaymentShape),
  });
});

router.get("/projects/:id/quotes", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const rows = await quotesForClient(project.clientName);
  res.json(rows.map(toQuoteSummary));
});

router.post("/projects/:id/outline", upload.single("file"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
    return;
  }
  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  try {
    const parsed = await extractTextFromUpload(file.buffer, file.originalname);
    const dataBase64 = file.buffer.toString("base64");
    if (dataBase64.length > 14_000_000) {
      res.status(400).json({ error: "File too large to store (max ~10MB)" });
      return;
    }
    const [updated] = await db.update(projectsTable).set({
      technicalOutline: parsed.text,
      outlineFileName: file.originalname,
      outlineFileData: dataBase64,
    }).where(eq(projectsTable.id, id)).returning();
    const teamMap = await teamMapForProjects([id]);
    res.json({
      project: toProjectShape(updated!, teamMap.get(id) ?? []),
      parsed: { detectedLanguage: parsed.detectedLanguage, fileName: parsed.fileName },
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/projects/:id/outline-file", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project?.outlineFileData) {
    res.status(404).json({ error: "Outline file not found" });
    return;
  }
  res.json({
    fileName: project.outlineFileName ?? "outline",
    dataBase64: project.outlineFileData,
  });
});

router.post("/projects/:id/link-quote", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const quoteId = Number(req.body?.quoteId);
  const importPrice = req.body?.importPrice !== false;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  const projectClient = (project.clientName ?? "").trim().toLowerCase();
  const quoteClient = quote.clientName.trim().toLowerCase();
  if (projectClient && quoteClient && projectClient !== quoteClient) {
    res.status(400).json({ error: "Quote belongs to a different client" });
    return;
  }

  const price = Number(quote.price);
  const patch: Record<string, string | number | null> = {
    quoteId,
    technicalOutline: quote.technicalOutline ?? project.technicalOutline,
    generatedReport: quote.generatedReport ?? project.generatedReport,
  };
  if (importPrice && price > 0) {
    patch.clientPrice = String(price);
    patch.remainingAmount = String(Math.max(0, price - Number(project.paidAmount)));
    patch.netProfit = String(price - Number(project.totalCost));
  }

  const [updated] = await db.update(projectsTable).set(patch).where(eq(projectsTable.id, id)).returning();
  const teamMap = await teamMapForProjects([id]);
  res.json({
    project: toProjectShape(updated!, teamMap.get(id) ?? []),
    quote: toQuoteSummary(quote),
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
