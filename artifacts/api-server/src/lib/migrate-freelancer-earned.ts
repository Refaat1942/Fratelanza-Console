import { db, freelancersTable, projectsTable, projectTeamTable, freelancerPaymentsTable, projectPaymentsTable, appSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { derivedProjectColumns, nameKey, projectCommitments, projectDate } from "./financials";

/** Tables/columns this version needs (safe to re-run; mirrors scripts/vps-migrate.sql). */
export async function ensureFinanceTables(): Promise<void> {
  await db.execute(sql`ALTER TABLE general_expenses ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS freelancer_payments (
      id serial PRIMARY KEY,
      project_id integer,
      freelancer_name text NOT NULL,
      amount numeric(12, 2) NOT NULL,
      payment_method text NOT NULL DEFAULT 'bank_transfer',
      paid_at text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contracts (
      id serial PRIMARY KEY,
      type text NOT NULL,
      project_id integer,
      party_name text NOT NULL DEFAULT '',
      amount numeric(12, 2) NOT NULL DEFAULT 0,
      data text NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS equity_entries (
      id serial PRIMARY KEY,
      type text NOT NULL,
      amount numeric(12, 2) NOT NULL,
      date text NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text NOT NULL)`);
}

/**
 * The freelancer "Earned" amount used to be typed by hand. It is now the sum of
 * payments recorded on projects. Any hand-typed amount still on a freelancer is
 * turned into payment records: spread over their projects oldest first (up to
 * what is still owed on each), any rest kept as an opening balance without a
 * project. The Earned field is then cleared, so this runs once per amount.
 */
export async function migrateLegacyFreelancerEarned(): Promise<void> {
  const freelancers = await db.select().from(freelancersTable);
  const legacy = freelancers.filter((f) => Number(f.earned) > 0);
  if (legacy.length === 0) return;

  const projects = await db.select().from(projectsTable);
  const team = await db.select().from(projectTeamTable);
  const existing = await db.select().from(freelancerPaymentsTable);
  const sorted = [...projects].sort((a, b) => projectDate(a).localeCompare(projectDate(b)) || a.id - b.id);

  for (const fr of legacy) {
    let left = Number(fr.earned);
    const rows: (typeof freelancerPaymentsTable.$inferInsert)[] = [];
    for (const p of sorted) {
      if (left <= 0) break;
      const c = projectCommitments(p, team).find((x) => x.name === nameKey(fr.name));
      if (!c) continue;
      const alreadyPaid = existing
        .filter((e) => e.projectId === p.id && nameKey(e.freelancerName) === c.name)
        .reduce((s, e) => s + Number(e.amount), 0);
      const amount = Math.min(left, Math.max(0, c.commission - alreadyPaid));
      if (amount <= 0) continue;
      rows.push({
        projectId: p.id, freelancerName: fr.name, amount: String(amount),
        paidAt: projectDate(p), notes: "Opening balance (moved from Freelancers tab)",
      });
      left -= amount;
    }
    if (left > 0.005) {
      rows.push({
        // Paid at some point before this version; date it when the freelancer was added
        projectId: null, freelancerName: fr.name, amount: String(left),
        paidAt: fr.createdAt.toISOString().slice(0, 10), notes: "Opening balance not linked to a project (moved from Freelancers tab)",
      });
    }
    await db.transaction(async (tx) => {
      if (rows.length) await tx.insert(freelancerPaymentsTable).values(rows);
      await tx.update(freelancersTable).set({ earned: "0", balance: "0" }).where(eq(freelancersTable.id, fr.id));
    });
    logger.info({ freelancer: fr.name, amount: Number(fr.earned), rows: rows.length }, "Moved legacy freelancer Earned to payments");
  }
}

export type PaymentCorrection = {
  projectId: number;
  projectName: string;
  before: number;
  after: number;
  action: "removed_double_count" | "logged_unrecorded_payment" | "matched_records";
  at: string;
};

export const RECONCILIATION_KEY = "payments_reconciliation";

/**
 * Client payment records are the single source of truth for what a project has
 * received. Older versions also kept a running "paid" total that could drift
 * (edited by hand, or a down payment typed on the project and then logged again
 * as a payment). This brings every project back in line and keeps a log of what
 * changed so it can be shown in Finance → Data checks.
 */
export async function reconcileProjectPayments(): Promise<void> {
  const projects = await db.select().from(projectsTable);
  const payments = await db.select().from(projectPaymentsTable);
  const corrections: PaymentCorrection[] = [];
  const now = new Date().toISOString();
  const r2 = (n: number) => Math.round(n * 100) / 100;

  for (const p of projects) {
    const rows = payments.filter((x) => x.projectId === p.id);
    const logged = r2(rows.reduce((s, x) => s + Number(x.amount), 0));
    const paid = r2(Number(p.paidAmount));
    const diff = r2(paid - logged);
    if (Math.abs(diff) < 0.01) continue;

    // Same amount typed on the project AND logged as a payment → counted twice.
    const doubleCounted = diff > 0 && rows.some((x) => Math.abs(Number(x.amount) - diff) < 0.01);
    let after = logged;
    let action: PaymentCorrection["action"] = diff > 0 ? "removed_double_count" : "matched_records";

    await db.transaction(async (tx) => {
      if (diff > 0 && !doubleCounted) {
        // Received but never logged as a payment: keep it, as a dated record.
        await tx.insert(projectPaymentsTable).values({
          projectId: p.id, amount: String(diff),
          paidAt: projectDate(p), notes: "Paid amount entered on the project (moved into payment records)",
        });
        after = paid;
        action = "logged_unrecorded_payment";
      }
      await tx.update(projectsTable).set({
        paidAmount: String(after),
        ...derivedProjectColumns(Number(p.clientPrice), Number(p.totalCost), after),
      }).where(eq(projectsTable.id, p.id));
    });
    corrections.push({ projectId: p.id, projectName: p.projectName, before: paid, after, action, at: now });
    logger.info({ project: p.projectName, before: paid, after, action }, "Reconciled project paid amount with payment records");
  }

  if (corrections.length === 0) return;
  const [prev] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, RECONCILIATION_KEY));
  let log: PaymentCorrection[] = [];
  try { log = prev ? JSON.parse(prev.value) : []; } catch { log = []; }
  const value = JSON.stringify([...log, ...corrections]);
  await db.insert(appSettingsTable).values({ key: RECONCILIATION_KEY, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
}
