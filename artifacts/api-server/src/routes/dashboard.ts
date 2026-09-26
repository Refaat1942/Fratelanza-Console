import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, expensesTable, clientsTable, freelancersTable } from "@workspace/db";
import { sql, and, isNotNull, ne } from "drizzle-orm";
import { projectFigures, pct } from "../lib/financials.js";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);

  const [expAgg] = await db
    .select({ totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)` })
    .from(expensesTable);

  const [clientCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clientsTable);

  const [freelancerCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(freelancersTable);

  let totalPaid = 0;
  let totalRemaining = 0;
  let totalCost = 0;
  let totalContractValue = 0;
  let expectedProjectProfit = 0;
  for (const p of projects) {
    const f = projectFigures(p);
    totalPaid += f.paid;
    totalRemaining += f.receivable;
    totalCost += f.cost;
    totalContractValue += f.contractValue;
    expectedProjectProfit += f.expectedProfit;
  }
  const totalExpenses = Number(expAgg?.totalExpenses ?? 0);

  // Per-project remaining breakdown (only projects the client still owes money on)
  const remainingBreakdown = projects
    .map((p) => ({ p, remaining: projectFigures(p).receivable }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .map(({ p, remaining }) => ({
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName ?? "",
      remaining,
    }));

  // Cash net profit = money collected - project costs (freelancers + direct) - operating expenses
  const totalNetProfit = totalPaid - totalCost - totalExpenses;
  // Expected net profit = what is left once every open balance is collected
  const expectedNetProfit = expectedProjectProfit - totalExpenses;

  res.json({
    // Gross revenue = money actually collected (paid). Unpaid balances are NOT revenue.
    totalRevenue: totalPaid,
    totalPaid,
    totalRemaining,
    totalNetProfit,
    totalExpenses,
    totalCost,
    totalContractValue,
    expectedNetProfit,
    grossMarginPct: pct(totalContractValue - totalCost, totalContractValue),
    netMarginPct: pct(expectedNetProfit, totalContractValue),
    activeProjects: projects.filter((p) => p.status === "Ongoing").length,
    completedProjects: projects.filter((p) => p.status === "Completed").length,
    lossProjects: projects.filter((p) => projectFigures(p).expectedProfit < 0).length,
    totalClients: Number(clientCount?.count ?? 0),
    totalFreelancers: Number(freelancerCount?.count ?? 0),
    remainingBreakdown,
  });
});

router.get("/dashboard/profit-by-type", async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);
  const byType = new Map<string, { netProfit: number; count: number }>();
  for (const p of projects) {
    const cur = byType.get(p.type) ?? { netProfit: 0, count: 0 };
    cur.netProfit += projectFigures(p).expectedProfit;
    cur.count += 1;
    byType.set(p.type, cur);
  }

  res.json([...byType.entries()].map(([type, v]) => ({ type, ...v })));
});

router.get("/dashboard/payment-alerts", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: projectsTable.id,
      projectName: projectsTable.projectName,
      clientName: projectsTable.clientName,
      remaining: projectsTable.remainingAmount,
      nextPaymentDate: projectsTable.nextPaymentDate,
    })
    .from(projectsTable)
    .where(
      and(
        sql`remaining_amount::numeric > 0`,
        ne(projectsTable.status, "Cancelled"),
        isNotNull(projectsTable.nextPaymentDate),
        ne(projectsTable.nextPaymentDate, "")
      )
    )
    .orderBy(projectsTable.nextPaymentDate)
    .limit(20);

  res.json(
    rows.map((r) => ({
      id: r.id,
      projectName: r.projectName,
      clientName: r.clientName ?? "",
      remaining: Number(r.remaining),
      nextPaymentDate: r.nextPaymentDate ?? "",
    }))
  );
});

router.get("/dashboard/recent-projects", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(projectsTable)
    .orderBy(sql`created_at desc`)
    .limit(5);

  res.json(
    rows.map((r) => ({
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
    }))
  );
});

export default router;
