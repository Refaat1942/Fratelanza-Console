import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { expensesTable, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const EXPENSE_CATEGORIES = [
  "Payroll",
  "Freelancers",
  "Software & Subscriptions",
  "Marketing",
  "Office",
  "Travel & Transport",
  "Training",
  "Equipment",
  "Banking & Fees",
  "Meals",
  "Other",
] as const;

type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

function smartCategory(description: string): ExpenseCategory {
  const text = description.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["Payroll", ["salary", "salaries", "payroll", "wage", "bonus", "employee", "staff"]],
    ["Freelancers", ["freelancer", "instructor", "trainer", "commission", "contractor"]],
    ["Software & Subscriptions", ["subscription", "software", "license", "hosting", "domain", "server", "vps", "cloud", "github", "openai", "api", "saas"]],
    ["Marketing", ["marketing", "ads", "advertising", "facebook", "google", "campaign", "design", "social media"]],
    ["Office", ["office", "rent", "workspace", "coworking", "internet", "electricity", "water", "utilities", "stationery"]],
    ["Travel & Transport", ["travel", "taxi", "uber", "careem", "fuel", "transport", "flight", "hotel"]],
    ["Training", ["training", "course", "workshop", "certificate", "learning"]],
    ["Equipment", ["laptop", "computer", "hardware", "monitor", "phone", "printer", "equipment"]],
    ["Banking & Fees", ["bank", "fee", "fees", "transfer", "transaction", "visa", "card", "tax"]],
    ["Meals", ["meal", "food", "coffee", "restaurant", "lunch", "dinner"]],
  ];
  return (rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] as ExpenseCategory | undefined) ?? "Other";
}

function normalizeKey(row: Record<string, unknown>, key: string): unknown {
  const wanted = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [rawKey, value] of Object.entries(row)) {
    if (rawKey.toLowerCase().replace(/[^a-z0-9]/g, "") === wanted) return value;
  }
  return undefined;
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const yyyy = String(parsed.y).padStart(4, "0");
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const raw = String(value ?? "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function toShape(r: typeof expensesTable.$inferSelect) {
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: r.category,
    date: r.date,
  };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(sql`date >= ${startDate}`);
  if (endDate) conditions.push(sql`date <= ${endDate}`);

  const rows = conditions.length
    ? await db.select().from(expensesTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(expensesTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toShape));
});

router.get("/expenses/summary", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(sql`date >= ${startDate}`);
  if (endDate) conditions.push(sql`date <= ${endDate}`);

  const [agg] = conditions.length
    ? await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
        count: sql<number>`count(*)`,
      }).from(expensesTable).where(and(...conditions))
    : await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
        count: sql<number>`count(*)`,
      }).from(expensesTable);

  res.json({
    totalExpenses: Number(agg?.totalExpenses ?? 0),
    count: Number(agg?.count ?? 0),
  });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.insert(expensesTable).values({
    description: body.description,
    amount: String(Number(body.amount ?? 0)),
    category: isExpenseCategory(body.category) ? body.category : smartCategory(String(body.description ?? "")),
    date: body.date ?? today,
  }).returning();
  res.status(201).json(toShape(row));
});


router.post("/expenses/import", upload.single("file"), async (req, res): Promise<void> => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
    return;
  }

  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  } catch {
    res.status(400).json({ error: "Could not parse file. Use .xlsx, .xls or .csv" });
    return;
  }

  let created = 0;
  let skipped = 0;
  const categories: Record<string, number> = {};
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const description = String(normalizeKey(row, "description") ?? "").trim();
    const amountRaw = normalizeKey(row, "amount");
    const amount = Number(String(amountRaw ?? "").replace(/,/g, ""));
    const date = normalizeDate(normalizeKey(row, "date"));

    if (!description || !Number.isFinite(amount)) {
      skipped++;
      errors.push({ row: i + 2, error: "Missing description or invalid amount" });
      continue;
    }

    const category = smartCategory(description);
    try {
      await db.insert(expensesTable).values({ description, amount: String(amount), category, date });
      created++;
      categories[category] = (categories[category] ?? 0) + 1;
    } catch (err) {
      errors.push({ row: i + 2, error: (err as Error).message });
    }
  }

  res.json({ totalRows: rows.length, created, skipped, categories, errors });
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/finance/report", async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const projConditions = [];
  const expConditions = [];
  if (startDate) {
    projConditions.push(sql`date::date >= ${startDate}::date`);
    expConditions.push(sql`date >= ${startDate}`);
  }
  if (endDate) {
    projConditions.push(sql`date::date <= ${endDate}::date`);
    expConditions.push(sql`date <= ${endDate}`);
  }

  const projects = projConditions.length
    ? await db.select().from(projectsTable).where(and(...projConditions)).orderBy(sql`date desc`)
    : await db.select().from(projectsTable).orderBy(sql`date desc`);

  const [expAgg] = expConditions.length
    ? await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
      }).from(expensesTable).where(and(...expConditions))
    : await db.select({
        totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)`,
      }).from(expensesTable);

  const totalRevenue = projects.reduce((s, p) => s + Number(p.clientPrice), 0);
  const totalPaid = projects.reduce((s, p) => s + Number(p.paidAmount), 0);
  const totalRemaining = projects.reduce((s, p) => s + Number(p.remainingAmount), 0);
  const totalCost = projects.reduce((s, p) => s + Number(p.totalCost), 0);
  const totalNetProfit = projects.reduce((s, p) => s + Number(p.netProfit), 0);
  const totalExpenses = Number(expAgg?.totalExpenses ?? 0);
  const netBalance = totalNetProfit - totalExpenses;

  res.json({
    totalRevenue,
    totalPaid,
    totalRemaining,
    totalCost,
    totalNetProfit,
    totalExpenses,
    netBalance,
    projects: projects.map((r) => ({
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
    })),
  });
});

export default router;
