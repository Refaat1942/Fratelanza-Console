import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";

/** Owner capital put into the business and drawings taken out (equity movements). */
export const equityEntriesTable = pgTable("equity_entries", {
  id: serial("id").primaryKey(),
  /** capital | drawing */
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small key/value settings (e.g. equipment useful life for depreciation). */
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type EquityEntry = typeof equityEntriesTable.$inferSelect;
