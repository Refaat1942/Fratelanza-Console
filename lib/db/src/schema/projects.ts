import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("pricing_records", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("Software"),
  projectName: text("project_name").notNull(),
  clientName: text("client_name"),
  clientPrice: numeric("client_price", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  netProfit: numeric("net_profit", { precision: 12, scale: 2 }).notNull().default("0"),
  freelancerName: text("freelancer_name"),
  freelancerCommission: numeric("freelancer_commission", { precision: 12, scale: 2 }).notNull().default("0"),
  startDate: text("start_date"),
  deadline: text("deadline"),
  status: text("status").notNull().default("Ongoing"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remainingAmount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  nextPaymentDate: text("next_payment_date"),
  notes: text("notes"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  date: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
