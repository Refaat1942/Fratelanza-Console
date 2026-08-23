import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { freelancersTable, projectsTable, projectTeamTable, tasksTable } from "@workspace/db";
import { eq, or, sql, ilike, and, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function toShape(r: typeof freelancersTable.$inferSelect) {
  let skills: string[] | null = null;
  if (r.skills) {
    try {
      const parsed = JSON.parse(r.skills) as unknown;
      if (Array.isArray(parsed)) skills = parsed.map(String);
    } catch { /* ignore */ }
  }
  return {
    code: r.code,
    name: r.name,
    phone: r.phone,
    spec: r.spec,
    position: r.position,
    earned: Number(r.earned),
    balance: Number(r.balance),
    rating: Number(r.rating),
    bio: r.bio,
    portfolioUrl: r.portfolioUrl,
    cvFileName: r.cvFileName,
    hasCv: Boolean(r.cvData),
    skills,
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

function parseFreelancerRows(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

function rowToFreelancerValues(r: Record<string, unknown>, i: number) {
  const norm = (k: string) =>
    r[k] ?? r[k.toLowerCase()] ?? r[k.charAt(0).toUpperCase() + k.slice(1)] ?? null;
  const name = norm("name");
  if (!name || String(name).trim() === "") return null;
  const codeRaw = norm("code");
  const code = codeRaw ? String(codeRaw).trim() : `FL-${Date.now()}-${i}`;
  return {
    code,
    name: String(name).trim(),
    phone: norm("phone") != null ? String(norm("phone")) : null,
    spec: norm("spec") != null ? String(norm("spec")) : null,
    position: norm("position") != null ? String(norm("position")) : null,
    earned: String(Number(norm("earned") ?? 0) || 0),
    balance: String(Number(norm("balance") ?? 0) || 0),
    rating: String(Math.max(1, Math.min(5, Number(norm("rating") ?? 5) || 5))),
  };
}

router.get("/freelancers/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(freelancersTable).orderBy(freelancersTable.name);
  const data = rows.map((r) => ({
    code: r.code,
    name: r.name,
    phone: r.phone ?? "",
    spec: r.spec ?? "",
    position: r.position ?? "",
    earned: Number(r.earned),
    balance: Number(r.balance),
    rating: Number(r.rating),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Freelancers");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="freelancers.xlsx"');
  res.send(buf);
});

router.post("/freelancers/sync", upload.single("file"), async (req, res): Promise<void> => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
    return;
  }
  let rows: Record<string, unknown>[];
  try {
    rows = parseFreelancerRows(file.buffer);
  } catch {
    res.status(400).json({ error: "Could not parse file. Use .xlsx, .xls or .csv" });
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;
  const errors: { row: number; error: string }[] = [];
  const codesInSheet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const values = rowToFreelancerValues(rows[i]!, i);
    if (!values) {
      skipped++;
      continue;
    }
    codesInSheet.add(values.code);
    try {
      const [existing] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, values.code));
      if (existing) {
        await db.update(freelancersTable).set(values).where(eq(freelancersTable.code, values.code));
        updated++;
      } else {
        await db.insert(freelancersTable).values(values);
        created++;
      }
    } catch (err) {
      errors.push({ row: i + 2, error: (err as Error).message });
    }
  }

  const all = await db.select({ code: freelancersTable.code }).from(freelancersTable);
  for (const fr of all) {
    if (!codesInSheet.has(fr.code)) {
      await db.delete(freelancersTable).where(eq(freelancersTable.code, fr.code));
      deleted++;
    }
  }

  res.json({ totalRows: rows.length, created, updated, skipped, deleted, errors });
});

router.get("/freelancers/:code/history", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [fr] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, rawCode)).limit(1);
  if (!fr) { res.status(404).json({ error: "Freelancer not found" }); return; }

  // Tasks assigned to this freelancer (by name match)
  const taskRows = await db.select().from(tasksTable)
    .where(eq(tasksTable.assignedTo, fr.name))
    .orderBy(desc(tasksTable.createdAt));

  // Projects: either primary freelancer (projects.freelancer_name) OR in project_team
  const teamRows = await db.select({ projectId: projectTeamTable.projectId, commission: projectTeamTable.commission })
    .from(projectTeamTable)
    .where(eq(projectTeamTable.freelancerName, fr.name));
  const teamIds = teamRows.map((r) => r.projectId);
  const commissionByProject = new Map<number, number>();
  for (const r of teamRows) commissionByProject.set(r.projectId, Number(r.commission));

  const projRows = await db.select().from(projectsTable)
    .where(
      teamIds.length > 0
        ? or(eq(projectsTable.freelancerName, fr.name), inArray(projectsTable.id, teamIds))
        : eq(projectsTable.freelancerName, fr.name)
    )
    .orderBy(desc(projectsTable.date));

  let totalCommission = 0;
  const projects = projRows.map((p) => {
    const teamCommission = commissionByProject.get(p.id);
    const commission = teamCommission !== undefined ? teamCommission : Number(p.freelancerCommission);
    totalCommission += commission;
    return {
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName ?? "",
      status: p.status,
      commission,
      startDate: p.startDate ?? "",
      deadline: p.deadline ?? "",
      notes: p.notes ?? "",
    };
  });

  res.json({
    freelancer: toShape(fr),
    tasks: taskRows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      projectId: r.projectId,
      projectName: r.projectName,
      assignedTo: r.assignedTo,
      dueDate: r.dueDate,
      createdAt: r.createdAt.toISOString(),
    })),
    projects,
    totals: {
      taskCount: taskRows.length,
      completedTasks: taskRows.filter((t) => t.status === "Done").length,
      projectCount: projects.length,
      totalCommission,
    },
  });
});

router.get("/freelancers/:code/evaluation", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [fr] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, rawCode)).limit(1);
  if (!fr) { res.status(404).json({ error: "Freelancer not found" }); return; }

  // Per-project team rows for this freelancer
  const teamRows = await db.select().from(projectTeamTable).where(eq(projectTeamTable.freelancerName, fr.name));
  const teamProjectIds = teamRows.map((r) => r.projectId);
  const commissionByProject = new Map<number, number>();
  for (const r of teamRows) {
    commissionByProject.set(r.projectId, Number(r.commission));
  }

  // All projects involving this freelancer (legacy lead OR team)
  const projRows = await db.select().from(projectsTable).where(
    teamProjectIds.length > 0
      ? or(eq(projectsTable.freelancerName, fr.name), inArray(projectsTable.id, teamProjectIds))
      : eq(projectsTable.freelancerName, fr.name)
  );

  let totalEarned = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  let completedCount = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const p of projRows) {
    const teamCommission = commissionByProject.get(p.id);
    totalEarned += teamCommission !== undefined ? teamCommission : Number(p.freelancerCommission);
    if (p.status === "Completed") {
      completedCount += 1;
      if (p.deadline) {
        onTimeEligible += 1;
        // Without a tracked completion timestamp, use today as a proxy.
        if (today <= p.deadline) onTime += 1;
      }
    }
  }

  // Task counts
  const taskRows = await db.select().from(tasksTable).where(eq(tasksTable.assignedTo, fr.name));

  res.json({
    freelancerCode: fr.code,
    freelancerName: fr.name,
    projectsCount: projRows.length,
    completedProjects: completedCount,
    totalEarned,
    avgRating: Number(fr.rating),
    ratedProjects: 0,
    onTimePct: onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
    tasksCount: taskRows.length,
    completedTasks: taskRows.filter((t) => t.status === "Done").length,
  });
});

router.get("/freelancers/specializations", async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ spec: freelancersTable.spec })
    .from(freelancersTable)
    .where(sql`spec is not null`);
  res.json(rows.map((r) => r.spec).filter(Boolean));
});

router.post("/freelancers", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const name = String(body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const code = `FL-${Date.now()}`;
    const skills = Array.isArray(body.skills) ? JSON.stringify(body.skills) : null;

    const [row] = await db.insert(freelancersTable).values({
      code,
      name,
      phone: body.phone ? String(body.phone) : null,
      spec: body.spec ? String(body.spec) : null,
      position: body.position ? String(body.position) : null,
      earned: String(Number(body.earned ?? 0)),
      balance: String(Number(body.balance ?? 0)),
      rating: String(Math.max(1, Math.min(5, Number(body.rating ?? 5) || 5))),
      bio: body.bio ?? null,
      portfolioUrl: body.portfolioUrl ?? null,
      skills,
    }).returning();

    if (!row) {
      res.status(500).json({ error: "Failed to create freelancer" });
      return;
    }
    res.status(201).json(toShape(row));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message ?? "Failed to create freelancer" });
  }
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
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.portfolioUrl !== undefined) updates.portfolioUrl = body.portfolioUrl;
  if (body.skills !== undefined) updates.skills = Array.isArray(body.skills) ? JSON.stringify(body.skills) : null;

  const [row] = await db.update(freelancersTable).set(updates).where(eq(freelancersTable.code, rawCode)).returning();
  if (!row) {
    res.status(404).json({ error: "Freelancer not found" });
    return;
  }
  res.json(toShape(row));
});

router.get("/freelancers/:code/cv", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [row] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, rawCode)).limit(1);
  if (!row || !row.cvData) {
    res.status(404).json({ error: "CV not found" });
    return;
  }
  res.json({ fileName: row.cvFileName ?? "cv.pdf", dataBase64: row.cvData });
});

router.post("/freelancers/:code/cv", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const body = req.body ?? {};
  const fileName = String(body.fileName ?? "").trim();
  const dataBase64 = String(body.dataBase64 ?? "").trim();
  if (!fileName || !dataBase64) {
    res.status(400).json({ error: "fileName and dataBase64 are required" });
    return;
  }
  if (dataBase64.length > 3_000_000) {
    res.status(400).json({ error: "CV file too large (max ~2MB)" });
    return;
  }
  const [row] = await db.update(freelancersTable).set({
    cvFileName: fileName,
    cvData: dataBase64,
  }).where(eq(freelancersTable.code, rawCode)).returning();
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
    rows = parseFreelancerRows(file.buffer);
  } catch {
    res.status(400).json({ error: "Could not parse file. Use .xlsx, .xls or .csv" });
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const values = rowToFreelancerValues(rows[i]!, i);
    if (!values) {
      skipped++;
      continue;
    }

    try {
      const [existing] = await db.select().from(freelancersTable).where(eq(freelancersTable.code, values.code));
      if (existing) {
        await db.update(freelancersTable).set(values).where(eq(freelancersTable.code, values.code));
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
