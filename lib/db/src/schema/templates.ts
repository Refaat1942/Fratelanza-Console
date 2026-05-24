import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templatesTable = pgTable("templates", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("Software"),
  name: text("name").notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
  expenses: numeric("expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  multiplier: numeric("multiplier", { precision: 5, scale: 2 }).notNull().default("1"),
  broker: numeric("broker", { precision: 12, scale: 2 }).notNull().default("0"),
  students: integer("students").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
