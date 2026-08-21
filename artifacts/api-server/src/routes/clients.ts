import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { clientsTable, projectsTable, quotesTable } from "@workspace/db";
import { eq, sql, ilike, and, desc, or } from "drizzle-orm";

const router: IRouter = Router();

type PaymentStats = {
  projectCount: number;
  totalValue: number;
  totalPaid: number;
  totalRemaining: number;
};

function emptyStats(): PaymentStats {
  return { projectCount: 0, totalValue: 0, totalPaid: 0, totalRemaining: 0 };
}

async function paymentStatsByClientName(): Promise<Map<string, PaymentStats>> {
  const projects = await db.select().from(projectsTable);
  const map = new Map<string, PaymentStats>();
  for (const p of projects) {
    const key = (p.clientName ?? "").trim().toLowerCase();
    if (!key) continue;
    const cur = map.get(key) ?? emptyStats();
    cur.projectCount += 1;
    cur.totalValue += Number(p.clientPrice);
    cur.totalPaid += Number(p.paidAmount);
    cur.totalRemaining += Number(p.remainingAmount);
    map.set(key, cur);
  }
  return map;
}

function statsForClient(name: string, map: Map<string, PaymentStats>): PaymentStats {
  return map.get(name.trim().toLowerCase()) ?? emptyStats();
}

function toShape(r: typeof clientsTable.$inferSelect, stats?: PaymentStats) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    activity: r.activity,
    project: r.project,
    notes: r.notes,
    active: r.active,
    projectCount: stats?.projectCount ?? 0,
    totalValue: stats?.totalValue ?? 0,
    totalPaid: stats?.totalPaid ?? 0,
    totalRemaining: stats?.totalRemaining ?? 0,
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

function parseActiveFilter(raw: string | undefined): boolean | null {
  if (!raw || raw === "all") return null;
  if (raw === "true" || raw === "active") return true;
  if (raw === "false" || raw === "inactive") return false;
  return null;
}

function applyPaymentFilter(rows: ReturnType<typeof toShape>[], payment: string | undefined) {
  if (!payment || payment === "all") return rows;
  if (payment === "outstanding") return rows.filter((c) => c.totalRemaining > 0);
  if (payment === "paid") return rows.filter((c) => c.totalRemaining <= 0 && c.projectCount > 0);
  if (payment === "no_projects") return rows.filter((c) => c.projectCount === 0);
  return rows;
}

async function listClientsFiltered(query: Record<string, string>) {
  const { search, project, activity, active, payment } = query;
  const conditions = [];
  if (search) {
    conditions.push(
      or(ilike(clientsTable.name, `%${search}%`), ilike(clientsTable.activity, `%${search}%`))!,
    );
  }
  if (project) conditions.push(ilike(clientsTable.project, `%${project}%`));
  if (activity && activity !== "all") conditions.push(ilike(clientsTable.activity, `%${activity}%`));
  const activeFilter = parseActiveFilter(active);
  if (activeFilter !== null) conditions.push(eq(clientsTable.active, activeFilter));

  const rows = conditions.length
    ? await db.select().from(clientsTable).where(and(...conditions)).orderBy(clientsTable.name)
    : await db.select().from(clientsTable).orderBy(clientsTable.name);

  const statsMap = await paymentStatsByClientName();
  const enriched = rows.map((r) => toShape(r, statsForClient(r.name, statsMap)));
  return applyPaymentFilter(enriched, payment);
}

router.get("/clients", async (req, res): Promise<void> => {
  const query = req.query as Record<string, string>;
  res.json(await listClientsFiltered(query));
});

router.get("/clients/export", async (req, res): Promise<void> => {
  const rows = await listClientsFiltered(req.query as Record<string, string>);
  const data = rows.map((c) => ({
    name: c.name,
    phone: c.phone ?? "",
    address: c.address ?? "",
    activity: c.activity ?? "",
    project: c.project ?? "",
    active: c.active ? "Active" : "Inactive",
    projects: c.projectCount,
    totalValue: c.totalValue,
    totalPaid: c.totalPaid,
    totalRemaining: c.totalRemaining,
    notes: c.notes ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="clients.xlsx"');
  res.send(buf);
});

router.get("/clients/activities", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ activity: clientsTable.activity })
    .from(clientsTable)
    .where(sql`${clientsTable.activity} is not null and trim(${clientsTable.activity}) != ''`)
    .orderBy(clientsTable.activity);
  res.json(rows.map((r) => r.activity).filter(Boolean));
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
    active: body.active !== false,
  }).returning();
  const statsMap = await paymentStatsByClientName();
  res.status(201).json(toShape(row, statsForClient(row.name, statsMap)));
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

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(sql`lower(trim(${quotesTable.clientName})) = lower(trim(${client.name}))`)
    .orderBy(desc(quotesTable.createdAt));

  const stats = statsForClient(client.name, await paymentStatsByClientName());

  res.json({
    ...toShape(client, stats),
    projects: projects.map(toProjectShape),
    quotes: quotes.map((q) => ({
      id: q.id,
      clientName: q.clientName,
      projectName: q.projectName,
      price: Number(q.price),
      date: q.date,
      language: q.language,
    })),
    totalProjects: stats.projectCount,
    totalQuotes: quotes.length,
    totalValue: stats.totalValue,
    totalPaid: stats.totalPaid,
    totalRemaining: stats.totalRemaining,
  });
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Record<string, string | boolean | null | undefined> = {};
  for (const f of ["name", "phone", "address", "activity", "project", "notes"]) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.active !== undefined) updates.active = Boolean(body.active);
  const [row] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const statsMap = await paymentStatsByClientName();
  res.json(toShape(row, statsForClient(row.name, statsMap)));
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
