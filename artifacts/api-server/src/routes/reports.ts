import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";
import { db, projectsTable, projectPaymentsTable, freelancerPaymentsTable, expensesTable, freelancersTable } from "@workspace/db";
import { and, sql } from "drizzle-orm";
import { inRange, loadFreelancerPayables, periodFinancials, projectDate, projectFigures } from "../lib/financials.js";

const router: IRouter = Router();

const CATEGORY_LABELS: Record<string, { en: string; ar: string }> = {
  rent: { en: "Rent", ar: "إيجار" },
  salaries: { en: "Salaries", ar: "رواتب" },
  marketing: { en: "Marketing & ads", ar: "تسويق وإعلانات" },
  software: { en: "Software & subscriptions", ar: "برمجيات واشتراكات" },
  utilities: { en: "Utilities & internet", ar: "مرافق وإنترنت" },
  transport: { en: "Transport", ar: "مواصلات" },
  office: { en: "Office supplies", ar: "مستلزمات مكتبية" },
  equipment: { en: "Equipment", ar: "معدات" },
  taxes: { en: "Taxes & government fees", ar: "ضرائب ورسوم حكومية" },
  bank_fees: { en: "Bank fees", ar: "رسوم بنكية" },
  other: { en: "Other", ar: "أخرى" },
};

/** Every report for a date range (projects by start date, money by the day it moved). */
export async function buildReport(startDate?: string, endDate?: string) {
  const { projects, totals } = await periodFinancials(startDate, endDate);
  const allProjects = await db.select().from(projectsTable);
  const byId = new Map(allProjects.map((p) => [p.id, p]));
  const payables = await loadFreelancerPayables(allProjects);

  const projectRows = projects.map((p) => {
    const f = projectFigures(p);
    const toFreelancers = payables.costPaid(p);
    return {
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName ?? "",
      type: p.type,
      status: p.status,
      startDate: projectDate(p),
      price: Number(p.clientPrice),
      freelancersCost: payables.commissions(p),
      otherCosts: payables.otherCosts(p),
      projectNet: Number(p.clientPrice) - Number(p.totalCost),
      paid: f.paid,
      remaining: f.receivable,
      toFreelancers,
      fratelanzaShare: f.paid - toFreelancers,
      freelancersOwed: payables.owedForProject(p),
    };
  });

  // Client payments received in the period (+ paid amounts without a payment record, dated at project start)
  const clientPayments = await db.select().from(projectPaymentsTable);
  const logged = new Map<number, number>();
  const collections: { date: string; projectName: string; clientName: string; amount: number; method: string; notes: string }[] = [];
  for (const pay of clientPayments) {
    logged.set(pay.projectId, (logged.get(pay.projectId) ?? 0) + Number(pay.amount));
    const date = (pay.paidAt || pay.createdAt.toISOString()).slice(0, 10);
    const p = byId.get(pay.projectId);
    if (!p || !inRange(date, startDate, endDate)) continue;
    collections.push({ date, projectName: p.projectName, clientName: p.clientName ?? "", amount: Number(pay.amount), method: pay.paymentMethod, notes: pay.notes ?? "" });
  }
  for (const p of allProjects) {
    const unlogged = Number(p.paidAmount) - (logged.get(p.id) ?? 0);
    const date = projectDate(p);
    if (Math.abs(unlogged) > 0.005 && inRange(date, startDate, endDate)) {
      collections.push({ date, projectName: p.projectName, clientName: p.clientName ?? "", amount: unlogged, method: "", notes: "Paid amount entered on the project (no payment record)" });
    }
  }
  collections.sort((a, b) => b.date.localeCompare(a.date));

  // Money given to freelancers in the period
  const frPayments = (await db.select().from(freelancerPaymentsTable))
    .map((f) => ({
      date: (f.paidAt || f.createdAt.toISOString()).slice(0, 10),
      freelancerName: f.freelancerName,
      projectName: f.projectId != null ? byId.get(f.projectId)?.projectName ?? "" : "",
      amount: Number(f.amount),
      method: f.paymentMethod,
      notes: f.notes ?? "",
    }))
    .filter((f) => inRange(f.date, startDate, endDate))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Company expenses in the period
  const expConditions = [];
  if (startDate) expConditions.push(sql`date >= ${startDate}`);
  if (endDate) expConditions.push(sql`date <= ${endDate}`);
  const expenseRows = (expConditions.length
    ? await db.select().from(expensesTable).where(and(...expConditions))
    : await db.select().from(expensesTable))
    .map((e) => ({ date: e.date ?? "", category: e.category, description: e.description, amount: Number(e.amount) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const catMap = new Map<string, { total: number; count: number }>();
  for (const e of expenseRows) {
    const cur = catMap.get(e.category) ?? { total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    catMap.set(e.category, cur);
  }
  const expensesByCategory = [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total);

  // Freelancers: commissions, paid (all time and in period), still owed
  const freelancers = (await db.select().from(freelancersTable).orderBy(freelancersTable.name)).map((f) => {
    const x = payables.forFreelancer(f.name);
    return {
      name: f.name,
      spec: f.spec ?? "",
      commissions: x.totalCommission,
      paid: x.paid + Number(f.earned),
      paidInPeriod: frPayments.filter((p) => p.freelancerName.trim().toLowerCase() === f.name.trim().toLowerCase()).reduce((s, p) => s + p.amount, 0),
      owed: x.owed,
    };
  }).filter((f) => f.commissions > 0 || f.paid > 0);

  const today = new Date().toISOString().slice(0, 10);
  const receivables = projectRows
    .filter((p) => p.remaining > 0)
    .map((p) => {
      const next = byId.get(p.id)?.nextPaymentDate ?? "";
      return { projectName: p.projectName, clientName: p.clientName, price: p.price, paid: p.paid, remaining: p.remaining, nextPaymentDate: next, overdue: Boolean(next) && next < today };
    })
    .sort((a, b) => b.remaining - a.remaining);

  const fratelanzaShare = totals.totalPaid - totals.totalCostPaid;
  return {
    period: { startDate: startDate ?? "", endDate: endDate ?? "" },
    summary: {
      contractValue: totals.totalContractValue,
      moneyReceived: totals.totalPaid,
      givenToFreelancers: totals.totalCostPaid,
      fratelanzaShare,
      companyExpenses: totals.totalExpenses,
      fratelanzaProfitSoFar: totals.totalNetProfit,
      projectCosts: totals.totalCost,
      estimatedProfit: totals.expectedNetProfit,
      stillToCollect: totals.totalRemaining,
      stillOwedToFreelancers: totals.freelancerOwed,
      netMarginPct: totals.netMarginPct,
    },
    projects: projectRows,
    collections,
    freelancerPayments: frPayments,
    expenses: expenseRows,
    expensesByCategory,
    freelancers,
    receivables,
  };
}

function period(req: { query: unknown }) {
  const { startDate, endDate } = (req.query ?? {}) as Record<string, string | undefined>;
  return { startDate: startDate || undefined, endDate: endDate || undefined };
}

router.get("/reports", async (req, res): Promise<void> => {
  const { startDate, endDate } = period(req);
  res.json(await buildReport(startDate, endDate));
});

const HEAD: Record<string, { en: string; ar: string }> = {
  item: { en: "Item", ar: "البند" }, amount: { en: "Amount (EGP)", ar: "المبلغ (ج.م)" },
  project: { en: "Project", ar: "المشروع" }, client: { en: "Client", ar: "العميل" }, type: { en: "Type", ar: "النوع" },
  status: { en: "Status", ar: "الحالة" }, start: { en: "Start date", ar: "تاريخ البدء" }, price: { en: "Price", ar: "السعر" },
  freelancers: { en: "Freelancers", ar: "الفريلانسرز" }, other: { en: "Other costs", ar: "تكاليف أخرى" },
  net: { en: "Project net (price − costs)", ar: "صافي المشروع (السعر − التكاليف)" }, paid: { en: "Received", ar: "المستلم" },
  remaining: { en: "Still to collect", ar: "المتبقي للتحصيل" }, given: { en: "Given to freelancers", ar: "المدفوع للفريلانسرز" },
  share: { en: "Fratelanza share", ar: "نصيب فراتيلانزا" }, owed: { en: "Still owed to freelancers", ar: "المستحق للفريلانسرز" },
  date: { en: "Date", ar: "التاريخ" }, method: { en: "Method", ar: "طريقة الدفع" }, notes: { en: "Notes", ar: "ملاحظات" },
  freelancer: { en: "Freelancer", ar: "الفريلانسر" }, category: { en: "Category", ar: "التصنيف" }, description: { en: "Description", ar: "الوصف" },
  count: { en: "Count", ar: "العدد" }, spec: { en: "Specialization", ar: "التخصص" }, commissions: { en: "Commissions", ar: "العمولات" },
  paidTotal: { en: "Paid (all time)", ar: "المدفوع (الإجمالي)" }, paidPeriod: { en: "Paid in period", ar: "المدفوع في الفترة" },
  nextDue: { en: "Next due", ar: "الاستحقاق القادم" }, overdue: { en: "Overdue", ar: "متأخر" },
};

router.get("/reports/export", async (req, res): Promise<void> => {
  const { startDate, endDate } = period(req);
  const lang = (req.query as Record<string, string>).lang === "ar" ? "ar" : "en";
  const h = (k: string) => HEAD[k]![lang];
  const cat = (c: string) => CATEGORY_LABELS[c]?.[lang] ?? c;
  const r = await buildReport(startDate, endDate);
  const s = r.summary;
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const sheets: [string, Record<string, unknown>[]][] = [
    [L("Summary", "الملخص"), [
      { [h("item")]: L("Period", "الفترة"), [h("amount")]: `${startDate ?? L("start", "البداية")} → ${endDate ?? L("today", "اليوم")}` },
      { [h("item")]: L("Total deals", "إجمالي التعاقدات"), [h("amount")]: s.contractValue },
      { [h("item")]: L("Money received", "المبالغ المستلمة"), [h("amount")]: s.moneyReceived },
      { [h("item")]: L("Given to freelancers & other costs", "المدفوع للفريلانسرز والتكاليف الأخرى"), [h("amount")]: s.givenToFreelancers },
      { [h("item")]: L("Fratelanza share", "نصيب فراتيلانزا"), [h("amount")]: s.fratelanzaShare },
      { [h("item")]: L("Company expenses", "مصروفات الشركة"), [h("amount")]: s.companyExpenses },
      { [h("item")]: L("Fratelanza profit so far", "ربح فراتيلانزا حتى الآن"), [h("amount")]: s.fratelanzaProfitSoFar },
      { [h("item")]: L("Project costs (all freelancers + other)", "تكاليف المشاريع (كل الفريلانسرز + أخرى)"), [h("amount")]: s.projectCosts },
      { [h("item")]: L("Fratelanza estimated profit (until collection)", "ربح فراتيلانزا التقديري حتى التحصيل"), [h("amount")]: s.estimatedProfit },
      { [h("item")]: L("Still to collect from clients", "المتبقي للتحصيل من العملاء"), [h("amount")]: s.stillToCollect },
      { [h("item")]: L("Still owed to freelancers", "المستحق للفريلانسرز"), [h("amount")]: s.stillOwedToFreelancers },
      { [h("item")]: L("Net margin %", "هامش صافي الربح %"), [h("amount")]: s.netMarginPct },
    ]],
    [L("Projects", "المشاريع"), r.projects.map((p) => ({
      [h("project")]: p.projectName, [h("client")]: p.clientName, [h("type")]: p.type, [h("status")]: p.status, [h("start")]: p.startDate,
      [h("price")]: p.price, [h("freelancers")]: p.freelancersCost, [h("other")]: p.otherCosts, [h("net")]: p.projectNet,
      [h("paid")]: p.paid, [h("remaining")]: p.remaining, [h("given")]: p.toFreelancers, [h("share")]: p.fratelanzaShare, [h("owed")]: p.freelancersOwed,
    }))],
    [L("Money received", "المبالغ المستلمة"), r.collections.map((c) => ({
      [h("date")]: c.date, [h("project")]: c.projectName, [h("client")]: c.clientName, [h("amount")]: c.amount, [h("method")]: c.method, [h("notes")]: c.notes,
    }))],
    [L("Freelancer payments", "مدفوعات الفريلانسرز"), r.freelancerPayments.map((f) => ({
      [h("date")]: f.date, [h("freelancer")]: f.freelancerName, [h("project")]: f.projectName, [h("amount")]: f.amount, [h("method")]: f.method, [h("notes")]: f.notes,
    }))],
    [L("Expenses", "المصروفات"), r.expenses.map((e) => ({
      [h("date")]: e.date, [h("category")]: cat(e.category), [h("description")]: e.description, [h("amount")]: e.amount,
    }))],
    [L("Expenses by category", "المصروفات حسب التصنيف"), r.expensesByCategory.map((e) => ({
      [h("category")]: cat(e.category), [h("count")]: e.count, [h("amount")]: e.total,
    }))],
    [L("Freelancers", "الفريلانسرز"), r.freelancers.map((f) => ({
      [h("freelancer")]: f.name, [h("spec")]: f.spec, [h("commissions")]: f.commissions, [h("paidTotal")]: f.paid, [h("paidPeriod")]: f.paidInPeriod, [h("owed")]: f.owed,
    }))],
    [L("Receivables", "المستحقات"), r.receivables.map((x) => ({
      [h("project")]: x.projectName, [h("client")]: x.clientName, [h("price")]: x.price, [h("paid")]: x.paid, [h("remaining")]: x.remaining,
      [h("nextDue")]: x.nextPaymentDate, [h("overdue")]: x.overdue ? L("Yes", "نعم") : "",
    }))],
  ];

  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[L("No data for this period", "لا توجد بيانات لهذه الفترة")]]);
    const width = rows.length ? Object.keys(rows[0]!).map((k) => ({ wch: Math.max(12, Math.min(45, k.length + 4)) })) : [{ wch: 30 }];
    ws["!cols"] = width;
    if (lang === "ar") ws["!views"] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  if (lang === "ar") wb.Workbook = { Views: [{ RTL: true }] };
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const file = `fratelanza-report_${startDate ?? "start"}_${endDate ?? "today"}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
  res.send(buf);
});

export default router;
