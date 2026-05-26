import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, expensesTable, clientsTable, freelancersTable } from "@workspace/db";
import { sql, gt, lte, and, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [projAgg] = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(client_price::numeric), 0)`,
      totalPaid: sql<number>`coalesce(sum(paid_amount::numeric), 0)`,
      totalRemaining: sql<number>`coalesce(sum(remaining_amount::numeric), 0)`,
      totalCost: sql<number>`coalesce(sum(total_cost::numeric), 0)`,
      totalNetProfit: sql<number>`coalesce(sum(net_profit::numeric), 0)`,
      activeProjects: sql<number>`count(*) filter (where status = 'Ongoing')`,
      completedProjects: sql<number>`count(*) filter (where status = 'Completed')`,
    })
    .from(projectsTable);

  const [expAgg] = await db
    .select({ totalExpenses: sql<number>`coalesce(sum(amount::numeric), 0)` })
    .from(expensesTable);

  const [clientCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clientsTable);

  const [freelancerCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(freelancersTable);

  const totalPaid = Number(projAgg?.totalPaid ?? 0);
  const projectsNetProfit = Number(projAgg?.totalNetProfit ?? 0);
  const totalExpenses = Number(expAgg?.totalExpenses ?? 0);
  res.json({
    // Revenue = money actually collected (paid). Unpaid balances are NOT revenue.
    totalRevenue: totalPaid,
    totalPaid,
    totalRemaining: Number(projAgg?.totalRemaining ?? 0),
    // Net profit = sum(project net profit) - general expenses
    totalNetProfit: projectsNetProfit - totalExpenses,
    totalExpenses,
    activeProjects: Number(projAgg?.activeProjects ?? 0),
    completedProjects: Number(projAgg?.completedProjects ?? 0),
    totalClients: Number(clientCount?.count ?? 0),
    totalFreelancers: Number(freelancerCount?.count ?? 0),
  });
});

router.get("/dashboard/profit-by-type", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      type: projectsTable.type,
      netProfit: sql<number>`coalesce(sum(net_profit::numeric), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(projectsTable)
    .groupBy(projectsTable.type);

  res.json(
    rows.map((r) => ({
      type: r.type,
      netProfit: Number(r.netProfit),
      count: Number(r.count),
    }))
  );
});

router.get("/dashboard/payment-alerts", async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
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
        isNotNull(projectsTable.nextPaymentDate)
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
