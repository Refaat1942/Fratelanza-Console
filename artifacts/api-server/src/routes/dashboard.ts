import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, clientsTable, freelancersTable } from "@workspace/db";
import { sql, and, isNotNull, ne } from "drizzle-orm";
import { periodFinancials, projectFigures } from "../lib/financials.js";

const router: IRouter = Router();

function periodParams(req: { query: unknown }) {
  const { startDate, endDate } = (req.query ?? {}) as Record<string, string | undefined>;
  return { startDate: startDate || undefined, endDate: endDate || undefined };
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const { startDate, endDate } = periodParams(req);
  const { projects, totals, remainingBreakdown, acquisition } = await periodFinancials(startDate, endDate);

  const [clientCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clientsTable);

  const [freelancerCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(freelancersTable);

  res.json({
    totalRevenue: totals.totalPaid,
    totalPaid: totals.totalPaid,
    totalRemaining: totals.totalRemaining,
    totalNetProfit: totals.totalNetProfit,
    totalExpenses: totals.totalExpenses,
    totalCost: totals.totalCost,
    totalCostPaid: totals.totalCostPaid,
    freelancerOwed: totals.freelancerOwed,
    totalContractValue: totals.totalContractValue,
    expectedNetProfit: totals.expectedNetProfit,
    grossMarginPct: totals.grossMarginPct,
    netMarginPct: totals.netMarginPct,
    activeProjects: projects.filter((p) => p.status === "Ongoing").length,
    completedProjects: projects.filter((p) => p.status === "Completed").length,
    lossProjects: projects.filter((p) => projectFigures(p).expectedProfit < 0).length,
    totalClients: Number(clientCount?.count ?? 0),
    totalFreelancers: Number(freelancerCount?.count ?? 0),
    remainingBreakdown,
    acquisition,
  });
});

router.get("/dashboard/profit-by-type", async (req, res): Promise<void> => {
  const { startDate, endDate } = periodParams(req);
  const { projects } = await periodFinancials(startDate, endDate);
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
