import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { quotesTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";

const router: IRouter = Router();

type QuoteLineItem = { desc: string; price: number };

function parseLineItems(raw: string | null | undefined): QuoteLineItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuoteLineItem[];
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item) => item && typeof item.desc === "string")
      .map((item) => ({ desc: item.desc, price: Number(item.price ?? 0) }));
  } catch {
    return null;
  }
}

function serializeLineItems(items: QuoteLineItem[] | null | undefined): string | null {
  if (!items?.length) return null;
  return JSON.stringify(items);
}

function toShape(r: typeof quotesTable.$inferSelect) {
  return {
    id: r.id,
    clientName: r.clientName,
    projectName: r.projectName,
    lineItems: parseLineItems(r.lineItems),
    price: Number(r.price),
    language: r.language,
    date: r.date,
    paymentTerms: r.paymentTerms,
    milestones: r.milestones,
    notes: r.notes,
  };
}

router.get("/quotes", async (req, res): Promise<void> => {
  const { client, search } = req.query as Record<string, string>;
  const conditions = [];
  if (client) conditions.push(ilike(quotesTable.clientName, `%${client}%`));
  if (search) conditions.push(ilike(quotesTable.projectName, `%${search}%`));

  const rows = conditions.length
    ? await db.select().from(quotesTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(quotesTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toShape));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.insert(quotesTable).values({
    clientName: body.clientName,
    projectName: body.projectName ?? null,
    lineItems: serializeLineItems(body.lineItems),
    price: String(Number(body.price ?? 0)),
    language: body.language ?? "English",
    date: body.date ?? today,
    paymentTerms: body.paymentTerms ?? null,
    milestones: body.milestones ?? null,
    notes: body.notes ?? null,
  }).returning();
  res.status(201).json(toShape(row));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const updates: Record<string, string | null | undefined> = {};
  if (body.clientName !== undefined) updates.clientName = body.clientName;
  if (body.projectName !== undefined) updates.projectName = body.projectName;
  if (body.lineItems !== undefined) updates.lineItems = serializeLineItems(body.lineItems);
  if (body.price !== undefined) updates.price = String(Number(body.price));
  if (body.language !== undefined) updates.language = body.language;
  if (body.date !== undefined) updates.date = body.date;
  if (body.paymentTerms !== undefined) updates.paymentTerms = body.paymentTerms;
  if (body.milestones !== undefined) updates.milestones = body.milestones;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [row] = await db.update(quotesTable).set(updates).where(eq(quotesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(quotesTable).where(eq(quotesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
