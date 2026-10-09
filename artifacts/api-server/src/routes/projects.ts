import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { projectsTable, projectTeamTable, projectPaymentsTable, quotesTable, freelancerPaymentsTable } from "@workspace/db";
import { eq, sql, and, ilike, inArray, desc, ne } from "drizzle-orm";
import { extractTextFromUpload } from "../lib/document-parser.js";
import { derivedProjectColumns, loadFreelancerPayables } from "../lib/financials.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PAYMENT_METHODS = new Set(["bank_transfer", "vodafone_cash", "instapay", "check", "cash"]);

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

type Payables = Awaited<ReturnType<typeof loadFreelancerPayables>>;

/**
 * Project money at a glance: price − freelancers − other costs = project net,
 * and how the money received so far splits between freelancers and Fratelanza.
 */
function withSplit(shape: ReturnType<typeof toProjectShape>, r: typeof projectsTable.$inferSelect, payables: Payables) {
  const toFreelancers = payables.costPaid(r);
  return {
    ...shape,
    freelancersCost: payables.commissions(r),
    otherCosts: payables.otherCosts(r),
    freelancersOwed: payables.owedForProject(r),
    toFreelancers,
    fratelanzaShare: Number(r.paidAmount) - toFreelancers,
  };
}


/** Ordered oldest → newest by payment date (then by entry time). */
const paymentsOldestFirst = sql`coalesce(paid_at, to_char(created_at, 'YYYY-MM-DD')) asc, created_at asc`;

/**
 * The payment records are the single source of truth: paid = sum of the
 * project's client payments, remaining = price − paid. Called after every
 * change so the stored totals can never drift from the payment list.
 */
async function syncProjectPaid(projectId: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const rows = await db.select().from(projectPaymentsTable).where(eq(projectPaymentsTable.projectId, projectId));
  const paid = Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  const [updated] = await db.update(projectsTable).set({
    paidAmount: String(paid),
    ...derivedProjectColumns(Number(project.clientPrice), Number(project.totalCost), paid),
  }).where(eq(projectsTable.id, projectId)).returning();
  return updated!;
}

async function paymentsOf(projectId: number) {
  return db.select().from(projectPaymentsTable)
    .where(eq(projectPaymentsTable.projectId, projectId))
    .orderBy(paymentsOldestFirst);
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
  const payables = await loadFreelancerPayables();
  res.json(rows.map((r) => withSplit(toProjectShape(r, teamMap.get(r.id) ?? []), r, payables)));
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
    .where(and(sql`remaining_amount::numeric > 0`, ne(projectsTable.status, "Cancelled")))
    .orderBy(projectsTable.nextPaymentDate);
  const teamMap = await teamMapForProjects(rows.map((r) => r.id));
  const payables = await loadFreelancerPayables();
  res.json(rows.map((r) => withSplit(toProjectShape(r, teamMap.get(r.id) ?? []), r, payables)));
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
    paidAmount: String(paid),
    ...derivedProjectColumns(price, cost, paid),
    freelancerCommission: String(Number(body.freelancerCommission ?? 0)),
    quoteId: body.quoteId != null ? Number(body.quoteId) : undefined,
  };

  const [project] = await db.insert(projectsTable).values(values).returning();

  // Record the down payment in the payment history so cash reports can date it
  if (paid > 0) {
    await db.insert(projectPaymentsTable).values({
      projectId: project.id,
      amount: String(paid),
      paymentMethod: PAYMENT_METHODS.has(body.paymentMethod) ? body.paymentMethod : "bank_transfer",
      paidAt: /^\d{4}-\d{2}-\d{2}/.test(body.startDate ?? "")
        ? String(body.startDate).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      notes: "Down payment",
    });
  }

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
  const payments = await paymentsOf(id);
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

  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Money fields: take what was sent, fall back to stored values, then always
  // re-derive net profit and remaining so they can never drift out of sync.
  const price = body.clientPrice !== undefined ? Number(body.clientPrice) : Number(existing.clientPrice);
  const cost = body.totalCost !== undefined ? Number(body.totalCost) : Number(existing.totalCost);
  // Paid is never typed on an existing project: it is the sum of its payment records
  const paid = (await paymentsOf(id)).reduce((sum, r) => sum + Number(r.amount), 0);
  const updates: Record<string, string | number | null | undefined> = {
    clientPrice: String(price),
    totalCost: String(cost),
    paidAmount: String(paid),
    ...derivedProjectColumns(price, cost, paid),
  };
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
  await db.delete(freelancerPaymentsTable).where(eq(freelancerPaymentsTable.projectId, id));
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
  const payments = await paymentsOf(id);
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

  const updated = (await syncProjectPaid(id))!;
  if (nextPaymentDate) {
    await db.update(projectsTable).set({ nextPaymentDate }).where(eq(projectsTable.id, id));
    updated.nextPaymentDate = nextPaymentDate;
  }
  const payments = await paymentsOf(id);
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
    Object.assign(patch, derivedProjectColumns(price, Number(project.totalCost), Number(project.paidAmount)));
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

function toFreelancerPaymentShape(r: typeof freelancerPaymentsTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    freelancerName: r.freelancerName,
    amount: Number(r.amount),
    paymentMethod: r.paymentMethod,
    paidAt: r.paidAt,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

async function freelancerPaymentsSummary(id: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) return null;
  const payables = await loadFreelancerPayables([project]);
  const payments = await db
    .select()
    .from(freelancerPaymentsTable)
    .where(eq(freelancerPaymentsTable.projectId, id))
    .orderBy(paymentsOldestFirst);
  return {
    members: payables.members(project),
    totalPaid: payables.freelancerPaid(project),
    totalOwed: payables.owedForProject(project),
    payments: payments.map(toFreelancerPaymentShape),
  };
}

/** Money given to the project's freelancers: who is owed what, and the history. */
router.get("/projects/:id/freelancer-payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const summary = await freelancerPaymentsSummary(id);
  if (!summary) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(summary);
});

router.post("/projects/:id/freelancer-payments", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { freelancerName, amount, paymentMethod, paidAt, notes } = req.body ?? {};
  const summary = await freelancerPaymentsSummary(id);
  if (!summary) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const member = summary.members.find((m) => m.freelancerName.trim().toLowerCase() === String(freelancerName ?? "").trim().toLowerCase());
  if (!member) {
    res.status(400).json({ error: "This freelancer is not on the project. Add them to the project first." });
    return;
  }
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) {
    res.status(400).json({ error: "Payment amount must be greater than zero" });
    return;
  }
  await db.insert(freelancerPaymentsTable).values({
    projectId: id,
    freelancerName: member.freelancerName,
    amount: String(payAmount),
    paymentMethod: PAYMENT_METHODS.has(paymentMethod) ? paymentMethod : "bank_transfer",
    paidAt: /^\d{4}-\d{2}-\d{2}/.test(paidAt ?? "") ? String(paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: notes ? String(notes) : null,
  });
  res.status(201).json(await freelancerPaymentsSummary(id));
});

router.delete("/projects/:id/freelancer-payments/:paymentId", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const paymentId = parseInt(Array.isArray(req.params.paymentId) ? req.params.paymentId[0] : req.params.paymentId, 10);
  const [deleted] = await db
    .delete(freelancerPaymentsTable)
    .where(and(eq(freelancerPaymentsTable.id, paymentId), eq(freelancerPaymentsTable.projectId, id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json(await freelancerPaymentsSummary(id));
});

/** Undo a client payment logged by mistake; paid / remaining are adjusted. */
router.delete("/projects/:id/payments/:paymentId", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const paymentId = parseInt(Array.isArray(req.params.paymentId) ? req.params.paymentId[0] : req.params.paymentId, 10);
  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [deleted] = await db
    .delete(projectPaymentsTable)
    .where(and(eq(projectPaymentsTable.id, paymentId), eq(projectPaymentsTable.projectId, id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  const updated = await syncProjectPaid(id);
  const payments = await paymentsOf(id);
  const teamMap = await teamMapForProjects([id]);
  res.json({
    project: toProjectShape(updated!, teamMap.get(id) ?? []),
    payments: payments.map(toPaymentShape),
  });
});

export default router;
