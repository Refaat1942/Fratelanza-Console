import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

/** Filled contract forms (client contract / freelancer contract), kept for re-printing. */
export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  /** client | freelancer */
  type: text("type").notNull(),
  projectId: integer("project_id"),
  /** Client or freelancer name, for listing */
  partyName: text("party_name").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  /** All form fields as JSON */
  data: text("data").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Contract = typeof contractsTable.$inferSelect;
