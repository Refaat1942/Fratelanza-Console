import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("sales_quotes", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  projectName: text("project_name"),
  lineItems: text("line_items"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  language: text("language").default("English"),
  date: text("date"),
  paymentTerms: text("payment_terms"),
  milestones: text("milestones"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
