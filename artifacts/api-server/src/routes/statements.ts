import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";
import { db, equityEntriesTable, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildChecks, buildStatements } from "../lib/statements.js";

const router: IRouter = Router();

function period(req: { query: unknown }) {
  const { startDate, endDate } = (req.query ?? {}) as Record<string, string | undefined>;
  return { startDate: startDate || undefined, endDate: endDate || undefined };
}

router.get("/finance/statements", async (req, res): Promise<void> => {
  const { startDate, endDate } = period(req);
  res.json(await buildStatements(startDate, endDate));
});

router.get("/finance/checks", async (_req, res): Promise<void> => {
  res.json(await buildChecks());
});

/* ── Owner capital / drawings ── */

router.post("/finance/equity", async (req, res): Promise<void> => {
  const { type, amount, date, notes } = req.body ?? {};
  const value = Number(amount);
  if (!value || value <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero" });
    return;
  }
  const [row] = await db.insert(equityEntriesTable).values({
    type: type === "drawing" ? "drawing" : "capital",
    amount: String(value),
    date: /^\d{4}-\d{2}-\d{2}/.test(date ?? "") ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: notes ? String(notes) : null,
  }).returning();
  res.status(201).json({ id: row!.id });
});

router.delete("/finance/equity/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.delete(equityEntriesTable).where(eq(equityEntriesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.sendStatus(204);
});

router.put("/finance/settings", async (req, res): Promise<void> => {
  const months = Math.round(Number(req.body?.usefulLifeMonths));
  if (!months || months < 1 || months > 600) {
    res.status(400).json({ error: "Useful life must be between 1 and 600 months" });
    return;
  }
  await db.insert(appSettingsTable).values({ key: "equipment_useful_life_months", value: String(months) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(months) } });
  res.json({ usefulLifeMonths: months });
});

/* ── Excel export ── */

const L: Record<string, [string, string]> = {
  revenue: ["Revenue", "الإيرادات"], Software: ["Software projects", "مشاريع البرمجيات"], Training: ["Training", "التدريب"],
  costOfRevenue: ["Cost of revenue", "تكلفة الإيرادات"], freelancers: ["Freelancer commissions", "عمولات الفريلانسرز"], other: ["Other project costs", "تكاليف أخرى للمشاريع"],
  grossProfit: ["Gross profit", "مجمل الربح"], operatingExpenses: ["Operating expenses", "المصروفات التشغيلية"],
  rent: ["Rent", "إيجار"], salaries: ["Salaries", "رواتب"], marketing: ["Marketing & ads", "تسويق وإعلانات"], software: ["Software & subscriptions", "برمجيات واشتراكات"],
  utilities: ["Utilities & internet", "مرافق وإنترنت"], transport: ["Transport", "مواصلات"], office: ["Office supplies", "مستلزمات مكتبية"], other_expense: ["Other", "أخرى"],
  unlinked_freelancer_payments: ["Freelancer payments not linked to a project", "مدفوعات فريلانسرز غير مرتبطة بمشروع"],
  ebitda: ["EBITDA", "الأرباح قبل الفوائد والضرائب والإهلاك (EBITDA)"], depreciation: ["Depreciation", "الإهلاك"], ebit: ["Operating profit (EBIT)", "الربح التشغيلي (EBIT)"],
  financeCosts: ["Finance costs (bank fees)", "تكاليف تمويلية (رسوم بنكية)"], profitBeforeTax: ["Profit before tax", "الربح قبل الضريبة"], taxes: ["Taxes", "الضرائب"], netIncome: ["Net income", "صافي الربح"],
  cash: ["Cash", "النقدية"], receivables: ["Accounts receivable (clients)", "العملاء (ذمم مدينة)"], freelancerAdvances: ["Advances to freelancers", "دفعات مقدمة للفريلانسرز"],
  currentAssets: ["Total current assets", "إجمالي الأصول المتداولة"], equipmentCost: ["Equipment (cost)", "المعدات (بالتكلفة)"], accumulatedDepreciation: ["Accumulated depreciation", "مجمع الإهلاك"],
  equipmentNet: ["Equipment (net)", "المعدات (صافي)"], totalAssets: ["TOTAL ASSETS", "إجمالي الأصول"], freelancerPayables: ["Owed to freelancers", "مستحقات الفريلانسرز (دائنون)"],
  customerAdvances: ["Client advances", "دفعات مقدمة من العملاء"], totalLiabilities: ["Total liabilities", "إجمالي الالتزامات"], capital: ["Owner capital", "رأس المال"],
  drawings: ["Owner drawings", "المسحوبات الشخصية"], retainedEarnings: ["Retained earnings", "الأرباح المحتجزة"], totalEquity: ["Total equity", "إجمالي حقوق الملكية"],
  liabilitiesAndEquity: ["TOTAL LIABILITIES & EQUITY", "إجمالي الالتزامات وحقوق الملكية"],
  collections: ["Collections from clients", "المتحصلات من العملاء"], freelancerPayments: ["Paid to freelancers", "المدفوع للفريلانسرز"], otherProjectCosts: ["Other project costs", "تكاليف أخرى للمشاريع"],
  operatingNet: ["Net cash from operations", "صافي التدفق من التشغيل"], equipment: ["Equipment purchases", "شراء معدات"], investingNet: ["Net cash from investing", "صافي التدفق من الاستثمار"],
  financingNet: ["Net cash from financing", "صافي التدفق من التمويل"], netChange: ["Net change in cash", "صافي التغير في النقدية"], openingCash: ["Opening cash", "النقدية أول المدة"], closingCash: ["Closing cash", "النقدية آخر المدة"],
};

const RATIO_NAMES: Record<string, [[string, string], [string, string]]> = {
  grossMargin: [["Gross margin", "gross profit ÷ revenue"], ["هامش مجمل الربح", "مجمل الربح ÷ الإيرادات"]],
  ebitdaMargin: [["EBITDA margin", "EBITDA ÷ revenue"], ["هامش EBITDA", "EBITDA ÷ الإيرادات"]],
  ebitMargin: [["Operating (EBIT) margin", "EBIT ÷ revenue"], ["هامش الربح التشغيلي", "EBIT ÷ الإيرادات"]],
  netMargin: [["Net margin", "net income ÷ revenue"], ["هامش صافي الربح", "صافي الربح ÷ الإيرادات"]],
  freelancerCostRatio: [["Freelancer cost ratio", "freelancer commissions ÷ revenue"], ["نسبة تكلفة الفريلانسرز", "عمولات الفريلانسرز ÷ الإيرادات"]],
  opexRatio: [["Operating expense ratio", "operating expenses ÷ revenue"], ["نسبة المصروفات التشغيلية", "المصروفات التشغيلية ÷ الإيرادات"]],
  breakEvenRevenue: [["Break-even revenue", "(opex + depreciation + finance costs) ÷ gross margin %"], ["إيراد نقطة التعادل", "(التشغيلية + الإهلاك + التمويل) ÷ هامش مجمل الربح"]],
  currentRatio: [["Current ratio", "current assets ÷ current liabilities"], ["نسبة التداول", "الأصول المتداولة ÷ الالتزامات المتداولة"]],
  cashRatio: [["Cash ratio", "cash ÷ current liabilities"], ["نسبة النقدية", "النقدية ÷ الالتزامات المتداولة"]],
  dso: [["Days sales outstanding", "receivables ÷ revenue × days"], ["متوسط فترة التحصيل", "العملاء ÷ الإيرادات × الأيام"]],
  collectionRate: [["Collection rate", "received ÷ contract value to date"], ["نسبة التحصيل", "المستلم ÷ قيمة العقود حتى تاريخه"]],
  monthlyBurn: [["Monthly fixed spending", "(opex + finance + taxes) ÷ months"], ["المصروفات الثابتة الشهرية", "(التشغيلية + التمويل + الضرائب) ÷ الشهور"]],
  cashRunway: [["Cash runway", "cash ÷ monthly fixed spending"], ["مدة كفاية النقدية", "النقدية ÷ المصروفات الشهرية"]],
  equityRatio: [["Equity ratio", "equity ÷ total assets"], ["نسبة حقوق الملكية", "حقوق الملكية ÷ إجمالي الأصول"]],
  liabilitiesToEquity: [["Liabilities to equity", "total liabilities ÷ equity"], ["الالتزامات إلى حقوق الملكية", "الالتزامات ÷ حقوق الملكية"]],
};

router.get("/finance/statements/export", async (req, res): Promise<void> => {
  const { startDate, endDate } = period(req);
  const ar = (req.query as Record<string, string>).lang === "ar";
  const t = (k: string) => (L[k] ?? L[`${k}_expense`] ?? [k, k])[ar ? 1 : 0];
  const s = await buildStatements(startDate, endDate);
  const is = s.incomeStatement.current;
  const prev = s.incomeStatement.previous;
  const H = ar ? { item: "البند", amount: "المبلغ (ج.م)", prev: "الفترة السابقة", pct: "% من الإيرادات" } : { item: "Item", amount: "Amount (EGP)", prev: "Previous period", pct: "% of revenue" };
  const isRow = (label: string, v: number, p?: number) => ({ [H.item]: label, [H.amount]: v, ...(prev ? { [H.prev]: p ?? "" } : {}), [H.pct]: is.revenue.total ? Math.round((v / is.revenue.total) * 1000) / 10 : "" });
  const prevLine = (k: string, list: "revenue" | "operatingExpenses") => prev?.[list].lines.find((l) => l.key === k)?.amount ?? 0;
  const incomeRows = [
    ...is.revenue.lines.map((l) => isRow(`  ${t(l.key)}`, l.amount, prevLine(l.key, "revenue"))),
    isRow(t("revenue"), is.revenue.total, prev?.revenue.total),
    isRow(`  ${t("freelancers")}`, -is.costOfRevenue.freelancers, prev ? -prev.costOfRevenue.freelancers : undefined),
    isRow(`  ${t("other")}`, -is.costOfRevenue.other, prev ? -prev.costOfRevenue.other : undefined),
    isRow(t("grossProfit"), is.grossProfit, prev?.grossProfit),
    ...is.operatingExpenses.lines.map((l) => isRow(`  ${t(l.key)}`, -l.amount, -prevLine(l.key, "operatingExpenses"))),
    isRow(t("operatingExpenses"), -is.operatingExpenses.total, prev ? -prev.operatingExpenses.total : undefined),
    isRow(t("ebitda"), is.ebitda, prev?.ebitda),
    isRow(t("depreciation"), -is.depreciation, prev ? -prev.depreciation : undefined),
    isRow(t("ebit"), is.ebit, prev?.ebit),
    isRow(t("financeCosts"), -is.financeCosts, prev ? -prev.financeCosts : undefined),
    isRow(t("profitBeforeTax"), is.profitBeforeTax, prev?.profitBeforeTax),
    isRow(t("taxes"), -is.taxes, prev ? -prev.taxes : undefined),
    isRow(t("netIncome"), is.netIncome, prev?.netIncome),
  ];
  const b = s.balanceSheet;
  const row = (k: string, v: number) => ({ [H.item]: t(k), [H.amount]: v });
  const balanceRows = [
    row("cash", b.assets.cash), row("receivables", b.assets.receivables), row("freelancerAdvances", b.assets.freelancerAdvances), row("currentAssets", b.assets.current),
    row("equipmentCost", b.assets.equipmentCost), row("accumulatedDepreciation", -b.assets.accumulatedDepreciation), row("equipmentNet", b.assets.equipmentNet),
    row("totalAssets", b.assets.total),
    row("freelancerPayables", b.liabilities.freelancerPayables), row("customerAdvances", b.liabilities.customerAdvances), row("totalLiabilities", b.liabilities.total),
    row("capital", b.equity.capital), row("drawings", -b.equity.drawings), row("retainedEarnings", b.equity.retainedEarnings), row("totalEquity", b.equity.total),
    row("liabilitiesAndEquity", b.liabilitiesAndEquity),
  ];
  const c = s.cashFlow;
  const cashRows = [
    row("openingCash", c.openingCash),
    row("collections", c.operating.collections), row("freelancerPayments", c.operating.freelancerPayments), row("otherProjectCosts", c.operating.otherProjectCosts),
    row("operatingExpenses", c.operating.operatingExpenses), row("financeCosts", c.operating.financeCosts), row("taxes", c.operating.taxes), row("operatingNet", c.operating.net),
    row("equipment", c.investing.equipment), row("investingNet", c.investing.net),
    row("capital", c.financing.capital), row("drawings", c.financing.drawings), row("financingNet", c.financing.net),
    row("netChange", c.netChange), row("closingCash", c.closingCash),
  ];
  const ratioRows = s.ratios.map((r) => {
    const [name, formula] = RATIO_NAMES[r.key]?.[ar ? 1 : 0] ?? [r.key, ""];
    const unit = ar ? { pct: "%", x: "مرة", days: "يوم", months: "شهر", egp: "ج.م" }[r.unit] : { pct: "%", x: "×", days: "days", months: "months", egp: "EGP" }[r.unit];
    return { [H.item]: name, [ar ? "القيمة" : "Value"]: r.value, [ar ? "الوحدة" : "Unit"]: unit, [ar ? "طريقة الحساب" : "Formula"]: formula };
  });

  const wb = XLSX.utils.book_new();
  const title = `${startDate ?? (ar ? "البداية" : "start")} → ${s.period.endDate}`;
  for (const [name, rows] of [
    [ar ? "قائمة الدخل" : "Income statement", incomeRows],
    [ar ? "الميزانية" : "Balance sheet", balanceRows],
    [ar ? "التدفقات النقدية" : "Cash flow", cashRows],
    [ar ? "المؤشرات" : "Ratios", ratioRows],
  ] as [string, Record<string, unknown>[]][]) {
    const ws = XLSX.utils.aoa_to_sheet([[title]]);
    XLSX.utils.sheet_add_json(ws, rows, { origin: "A3" });
    ws["!cols"] = [{ wch: 48 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    if (ar) ws["!views"] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (ar) wb.Workbook = { Views: [{ RTL: true }] };
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="fratelanza-financial-statements_${startDate ?? "start"}_${s.period.endDate}.xlsx"`);
  res.send(buf);
});

export default router;
