import { db, projectsTable, projectPaymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { derivedProjectColumns, projectDate } from "./financials";

/**
 * A project's stored "paid" amount used to be a running counter that could
 * drift from its payment history (e.g. an amount typed on the project before
 * payment history existed, then logged again as a payment, counted twice).
 *
 * - Project with a stored paid amount but no payment rows: the amount becomes a
 *   visible "Opening balance" payment, so nothing is lost and totals stay the same.
 * - Project with payment rows: paid / remaining are set to the payment history.
 *
 * Every changed row is first copied to project_paid_backup (old values kept),
 * so any change can be reviewed or reverted. Rows already in sync are untouched.
 */
export async function reconcileProjectPaid(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_paid_backup (
      id serial PRIMARY KEY,
      project_id integer NOT NULL,
      project_name text,
      old_paid numeric(12, 2) NOT NULL,
      old_remaining numeric(12, 2) NOT NULL,
      payments_total numeric(12, 2) NOT NULL,
      action text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);

  const projects = await db.select().from(projectsTable);
  const payments = await db.select().from(projectPaymentsTable);
  const byProject = new Map<number, { total: number; count: number }>();
  for (const p of payments) {
    const cur = byProject.get(p.projectId) ?? { total: 0, count: 0 };
    cur.total += Number(p.amount);
    cur.count += 1;
    byProject.set(p.projectId, cur);
  }

  for (const p of projects) {
    const stored = Number(p.paidAmount);
    const history = byProject.get(p.id) ?? { total: 0, count: 0 };
    const price = Number(p.clientPrice);
    const remainingOk = Math.abs(Number(p.remainingAmount) - Math.max(0, price - stored)) < 0.005;
    if (Math.abs(stored - history.total) < 0.005 && remainingOk) continue;

    const opening = history.count === 0 && stored > 0;
    const action = opening ? "opening_balance_row" : "synced_to_payment_history";
    const newPaid = opening ? stored : history.total;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO project_paid_backup (project_id, project_name, old_paid, old_remaining, payments_total, action)
        VALUES (${p.id}, ${p.projectName}, ${p.paidAmount}, ${p.remainingAmount}, ${String(history.total)}, ${action})`);
      if (opening) {
        await tx.insert(projectPaymentsTable).values({
          projectId: p.id,
          amount: String(stored),
          paymentMethod: "bank_transfer",
          paidAt: projectDate(p),
          notes: "Opening balance (paid amount entered on the project)",
        });
      }
      await tx.update(projectsTable).set({
        paidAmount: String(newPaid),
        ...derivedProjectColumns(price, Number(p.totalCost), newPaid),
      }).where(eq(projectsTable.id, p.id));
    });
    logger.info({ project: p.projectName, oldPaid: stored, newPaid, action }, "Reconciled project paid amount");
  }
}
