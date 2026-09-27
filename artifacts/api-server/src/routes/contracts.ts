import { Router, type IRouter } from "express";
import { db, contractsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

/** FRZ-C-2026-0007 (client) / FRZ-F-2026-0007 (freelancer) */
export function contractNumber(r: Pick<typeof contractsTable.$inferSelect, "id" | "type" | "createdAt">) {
  return `FRZ-${r.type === "freelancer" ? "F" : "C"}-${r.createdAt.getFullYear()}-${String(r.id).padStart(4, "0")}`;
}

function toShape(r: typeof contractsTable.$inferSelect) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(r.data) as Record<string, unknown>; } catch { /* keep empty */ }
  return {
    id: r.id,
    number: contractNumber(r),
    type: r.type,
    projectId: r.projectId,
    partyName: r.partyName,
    amount: Number(r.amount),
    data,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function values(body: Record<string, unknown>) {
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
  return {
    type: body.type === "freelancer" ? "freelancer" : "client",
    projectId: body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null,
    partyName: String(body.partyName ?? ""),
    amount: String(Number(body.amount ?? 0) || 0),
    data: JSON.stringify(data),
  };
}

router.get("/contracts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(contractsTable).orderBy(desc(contractsTable.createdAt));
  res.json(rows.map(toShape));
});

router.post("/contracts", async (req, res): Promise<void> => {
  const [row] = await db.insert(contractsTable).values(values(req.body ?? {})).returning();
  res.status(201).json(toShape(row!));
});

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.json(toShape(row));
});

router.patch("/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db
    .update(contractsTable)
    .set({ ...values(req.body ?? {}), updatedAt: new Date() })
    .where(eq(contractsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/contracts/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.delete(contractsTable).where(eq(contractsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
