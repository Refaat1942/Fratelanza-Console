import { Router, type IRouter } from "express";
import multer from "multer";
import mammoth from "mammoth";
import { extractTextFromUpload } from "../lib/document-parser.js";
import { db, proposalsTable, clientsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Read a specification document for the technical proposal.
 * Word files keep their structure (headings, lists, tables) as HTML; other
 * files (PDF, TXT, Excel) come back as plain text.
 */
router.post("/proposals/parse-document", upload.single("file"), async (req, res): Promise<void> => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
    return;
  }
  try {
    if (/\.docx$/i.test(file.originalname)) {
      const result = await mammoth.convertToHtml({ buffer: file.buffer });
      res.json({ html: result.value ?? "" });
      return;
    }
    const parsed = await extractTextFromUpload(file.buffer, file.originalname);
    res.json({ text: parsed.text });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

function toShape(r: typeof proposalsTable.$inferSelect) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(r.data) as Record<string, unknown>; } catch { /* keep empty */ }
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName,
    serviceKey: r.serviceKey,
    tier: r.tier,
    language: r.language,
    amount: Number(r.amount),
    data,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

/**
 * Link the proposal to a client: the chosen one, an existing client with the
 * same name, or a new client created from the customer details typed on the form.
 */
async function resolveClient(body: Record<string, unknown>): Promise<{ id: number | null; name: string }> {
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
  const customer = (data.customer && typeof data.customer === "object" ? data.customer : {}) as Record<string, unknown>;
  const name = str(body.clientName) || str(customer.company) || str(customer.contactName);
  const chosen = Number(body.clientId);
  if (chosen > 0) {
    const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, chosen));
    if (c) return { id: c.id, name: name || c.name };
  }
  if (!name) return { id: null, name: "" };
  const [same] = await db.select().from(clientsTable).where(sql`lower(trim(${clientsTable.name})) = ${name.toLowerCase()}`);
  if (same) return { id: same.id, name };
  const contact = [str(customer.contactName), str(customer.email)].filter(Boolean).join(" · ");
  const [created] = await db.insert(clientsTable).values({
    name,
    phone: str(customer.phone) || null,
    address: str(customer.address) || null,
    activity: str(customer.business) || null,
    notes: contact || null,
  }).returning();
  return { id: created!.id, name };
}

async function values(body: Record<string, unknown>) {
  const client = await resolveClient(body);
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
  return {
    clientId: client.id,
    clientName: client.name,
    serviceKey: str(body.serviceKey) || "websites",
    tier: ["starter", "business", "enterprise"].includes(str(body.tier)) ? str(body.tier) : "",
    language: str(body.language) === "en" ? "en" : "ar",
    amount: String(Number(body.amount ?? 0) || 0),
    data: JSON.stringify(data),
  };
}

router.get("/proposals", async (req, res): Promise<void> => {
  const clientId = Number(req.query.clientId);
  const rows = clientId > 0
    ? await db.select().from(proposalsTable).where(eq(proposalsTable.clientId, clientId)).orderBy(desc(proposalsTable.createdAt))
    : await db.select().from(proposalsTable).orderBy(desc(proposalsTable.createdAt));
  res.json(rows.map(toShape));
});

router.post("/proposals", async (req, res): Promise<void> => {
  const [row] = await db.insert(proposalsTable).values(await values(req.body ?? {})).returning();
  res.status(201).json(toShape(row!));
});

router.patch("/proposals/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.update(proposalsTable)
    .set({ ...(await values(req.body ?? {})), updatedAt: new Date() })
    .where(eq(proposalsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/proposals/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.delete(proposalsTable).where(eq(proposalsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
