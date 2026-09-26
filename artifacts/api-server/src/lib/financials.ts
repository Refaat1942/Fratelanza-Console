import type { projectsTable, projectPaymentsTable } from "@workspace/db";

type ProjectRow = typeof projectsTable.$inferSelect;
type PaymentRow = typeof projectPaymentsTable.$inferSelect;

/**
 * Single source of truth for per-project money figures, so the dashboard,
 * finance report, receivables and charts all agree.
 *
 * - `totalCost` already includes every freelancer commission plus direct costs
 *   (the project form adds them together before saving).
 * - A Cancelled project's unpaid balance will never be collected, so it is not
 *   a receivable and its earnable value is only what the client actually paid.
 */
export function projectFigures(p: Pick<ProjectRow, "clientPrice" | "totalCost" | "paidAmount" | "status">) {
  const price = Number(p.clientPrice);
  const cost = Number(p.totalCost);
  const paid = Number(p.paidAmount);
  const cancelled = p.status === "Cancelled";
  const contractValue = cancelled ? paid : price;
  return {
    contractValue,
    cost,
    paid,
    receivable: cancelled ? 0 : Math.max(0, price - paid),
    /** Profit this project makes once everything owed is collected */
    expectedProfit: contractValue - cost,
  };
}

export function isReceivable(p: Pick<ProjectRow, "clientPrice" | "totalCost" | "paidAmount" | "status">) {
  return projectFigures(p).receivable > 0;
}

/** Derived columns that must always be recomputed server-side from price/cost/paid. */
export function derivedProjectColumns(price: number, cost: number, paid: number) {
  return {
    netProfit: String(price - cost),
    remainingAmount: String(Math.max(0, price - paid)),
  };
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/**
 * Cash received per project, dated. Logged payments carry their own date.
 * Any part of `paidAmount` without a payment record (legacy data or a manually
 * edited paid amount) is dated at the project's start/creation date.
 */
export function cashReceipts(projects: ProjectRow[], payments: PaymentRow[]) {
  const loggedByProject = new Map<number, number>();
  const receipts: { projectId: number; date: string; amount: number }[] = [];
  const projectIds = new Set(projects.map((p) => p.id));

  for (const pay of payments) {
    if (!projectIds.has(pay.projectId)) continue;
    const amount = Number(pay.amount);
    loggedByProject.set(pay.projectId, (loggedByProject.get(pay.projectId) ?? 0) + amount);
    receipts.push({
      projectId: pay.projectId,
      date: (pay.paidAt || pay.createdAt.toISOString()).slice(0, 10),
      amount,
    });
  }

  for (const p of projects) {
    const logged = loggedByProject.get(p.id) ?? 0;
    const paid = Number(p.paidAmount);
    const unlogged = paid - logged;
    if (Math.abs(unlogged) > 0.005) {
      receipts.push({ projectId: p.id, date: projectDate(p), amount: unlogged });
    }
  }
  return receipts;
}

/** Date a project is booked on: its start date if set, otherwise when it was recorded. */
export function projectDate(p: Pick<ProjectRow, "startDate" | "date">) {
  const start = (p.startDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : p.date.toISOString().slice(0, 10);
}

export function inRange(date: string, startDate?: string, endDate?: string) {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}
