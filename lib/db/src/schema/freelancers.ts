import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const freelancersTable = pgTable("freelancers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  spec: text("spec"),
  position: text("position"),
  earned: numeric("earned", { precision: 12, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  rating: numeric("rating", { precision: 3, scale: 1 }).notNull().default("5"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFreelancerSchema = createInsertSchema(freelancersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFreelancer = z.infer<typeof insertFreelancerSchema>;
export type Freelancer = typeof freelancersTable.$inferSelect;
