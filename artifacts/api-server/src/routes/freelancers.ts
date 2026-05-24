import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { freelancersTable } from "@workspace/db";
import { eq, sql, ilike, and } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function toShape(r: typeof freelancersTable.$inferSelect) {
  return {
    code: r.code,
    name: r.name,
    phone: r.phone,
    spec: r.spec,
    position: r.position,
    earned: Number(r.earned),
    balance: Number(r.balance),
    rating: Number(r.rating),
  };
}

router.get("/freelancers", async (req, res): Promise<void> => {
  const { search, spec } = req.query as Record<string, string>;
  const conditions = [];
  if (search) conditions.push(ilike(freelancersTable.name, `%${search}%`));
  if (spec) conditions.push(eq(freelancersTable.spec, spec));

  const rows = conditions.length
    ? await db.select().from(freelancersTable).where(and(...conditions)).orderBy(freelancersTable.name)
    : await db.select().from(freelancersTable).orderBy(freelancersTable.name);

  res.json(rows.map(toShape));
});

router.get("/freelancers/specializations", async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ spec: freelancersTable.spec })
    .from(freelancersTable)
    .where(sql`spec is not null`);
  res.json(rows.map((r) => r.spec).filter(Boolean));
});

router.post("/freelancers", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const code = `FL-${Date.now()}`;
  const [row] = await db.insert(freelancersTable).values({
    code,
    name: body.name,
    phone: body.phone ?? null,
    spec: body.spec ?? null,
    position: body.position ?? null,
    earned: String(Number(body.earned ?? 0)),
    balance: String(Number(body.balance ?? 0)),
    rating: "5",
  }).returning();
  res.status(201).json(toShape(row));
});

router.patch("/freelancers/:code", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const body = req.body ?? {};
  const updates: Record<string, string | null | undefined> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.spec !== undefined) updates.spec = body.spec;
  if (body.position !== undefined) updates.position = body.position;
  if (body.earned !== undefined) updates.earned = String(Number(body.earned));
  if (body.balance !== undefined) updates.balance = String(Number(body.balance));
  if (body.rating !== undefined) updates.rating = String(Number(body.rating));

  const [row] = await db.update(freelancersTable).set(updates).where(eq(freelancersTable.code, rawCode)).returning();
  if (!row) {
    res.status(404).json({ error: "Freelancer not found" });
    return;
  }
  res.json(toShape(row));
});

router.delete("/freelancers/:code", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [deleted] = await db.delete(freelancersTable).where(eq(freelancersTable.code, rawCode)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Freelancer not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/freelancers/import", upload.single("file"), async (req, res): Promise<void> => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
    return;
  }
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  } catch (err) {
    res.status(400).json({ error: "Could not parse file. Use .xlsx, .xls or .csv" });
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const norm = (k: string) =>
      r[k] ?? r[k.toLowerCase()] ?? r[k.charAt(0).toUpperCase() + k.slice(1)] ?? null;

    const name = norm("name");
    if (!name || String(name).trim() === "") {
      skipped++;
      continue;
    }
    const codeRaw = norm("code");
    const code = codeRaw ? String(codeRaw).trim() : `FL-${Date.now()}-${i}`;
    const values = {
      code,
      name: String(name).trim(),
      phone: norm("phone") != null ? String(norm("phone")) : null,
      spec: norm("spec") != null ? String(norm("spec")) : null,
      position: norm("position") != null ? String(norm("position")) : null,
      earned: String(Number(norm("earned") ?? 0) || 0),
      balance: String(Number(norm("balance") ?? 0) || 0),
      rating: String(Math.max(1, Math.min(5, Number(norm("rating") ?? 5) || 5))),
    };

    try {
      const [existing] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, code));
      if (existing) {
        await db.update(freelancersTable).set(values).where(eq(freelancersTable.code, code));
        updated++;
      } else {
        await db.insert(freelancersTable).values(values);
        created++;
      }
    } catch (err) {
      errors.push({ row: i + 2, error: (err as Error).message });
    }
  }

  res.json({ totalRows: rows.length, created, updated, skipped, errors });
});

export default router;
