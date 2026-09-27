import { db, freelancersTable, projectsTable, projectTeamTable, freelancerPaymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { nameKey, projectCommitments, projectDate } from "./financials";

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
