import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";

/** Individual client payments logged against a project */
export const projectPaymentsTable = pgTable("project_payments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** bank_transfer | vodafone_cash | instapay | check */
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  paidAt: text("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectPayment = typeof projectPaymentsTable.$inferSelect;
