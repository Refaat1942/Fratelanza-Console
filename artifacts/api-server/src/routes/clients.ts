import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, projectsTable } from "@workspace/db";
import { eq, sql, ilike, and } from "drizzle-orm";

const router: IRouter = Router();

function toShape(r: typeof clientsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    activity: r.activity,
    project: r.project,
    notes: r.notes,
  };
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

router.get("/clients", async (req, res): Promise<void> => {
  const { search, project } = req.query as Record<string, string>;
  const conditions = [];
  if (search) conditions.push(ilike(clientsTable.name, `%${search}%`));
  if (project) conditions.push(ilike(clientsTable.project, `%${project}%`));

  const rows = conditions.length
    ? await db.select().from(clientsTable).where(and(...conditions)).orderBy(clientsTable.name)
    : await db.select().from(clientsTable).orderBy(clientsTable.name);

  res.json(rows.map(toShape));
});

router.post("/clients", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const [row] = await db.insert(clientsTable).values({
    name: body.name,
    phone: body.phone ?? null,
    address: body.address ?? null,
    activity: body.activity ?? null,
    project: body.project ?? null,
    notes: body.notes ?? null,
  }).returning();
  res.status(201).json(toShape(row));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(ilike(projectsTable.clientName, `%${client.name}%`));

  const totalValue = projects.reduce((s, p) => s + Number(p.clientPrice), 0);
  const totalPaid = projects.reduce((s, p) => s + Number(p.paidAmount), 0);
  const totalRemaining = projects.reduce((s, p) => s + Number(p.remainingAmount), 0);

  res.json({
    ...toShape(client),
    projects: projects.map(toProjectShape),
    totalProjects: projects.length,
    totalValue,
    totalPaid,
    totalRemaining,
  });
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Record<string, string | null | undefined> = {};
  for (const f of ["name", "phone", "address", "activity", "project", "notes"]) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  const [row] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(clientsTable).where(eq(clientsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
