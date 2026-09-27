import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";

/**
 * Money given to a freelancer, recorded from the project it belongs to.
 * projectId is null only for opening balances that could not be matched to a
 * project (moved from the old manual "Earned" field).
 */
export const freelancerPaymentsTable = pgTable("freelancer_payments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  freelancerName: text("freelancer_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** bank_transfer | vodafone_cash | instapay | check | cash */
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  paidAt: text("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FreelancerPayment = typeof freelancerPaymentsTable.$inferSelect;
