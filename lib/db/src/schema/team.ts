import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectTeamTable = pgTable("project_team", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  freelancerName: text("freelancer_name").notNull(),
  commission: numeric("commission", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectTeamSchema = createInsertSchema(projectTeamTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProjectTeam = z.infer<typeof insertProjectTeamSchema>;
export type ProjectTeam = typeof projectTeamTable.$inferSelect;


export const projectReceivablesTable = pgTable("project_receivables", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: text("due_date"),
  note: text("note"),
  status: text("status").notNull().default("Pending"),
  paidAt: text("paid_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const freelancerPaymentTermsTable = pgTable("freelancer_payment_terms", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  freelancerName: text("freelancer_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: text("due_date"),
  note: text("note"),
  status: text("status").notNull().default("Pending"),
  paidAt: text("paid_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectReceivable = typeof projectReceivablesTable.$inferSelect;
export type FreelancerPaymentTerm = typeof freelancerPaymentTermsTable.$inferSelect;
