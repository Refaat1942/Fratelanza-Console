import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

/** Sales quotes / technical proposals built from the service packages, kept per client. */
export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  clientName: text("client_name").notNull().default(""),
  /** Service catalog key, e.g. websites, mobile_apps */
  serviceKey: text("service_key").notNull(),
  /** Selected package: starter | business | enterprise ("" = all packages offered) */
  tier: text("tier").notNull().default(""),
  /** ar | en */
  language: text("language").notNull().default("ar"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Customer details and document options as JSON */
  data: text("data").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Proposal = typeof proposalsTable.$inferSelect;
