import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Todo"),
  priority: text("priority").default("Medium"),
  projectId: integer("project_id"),
  projectName: text("project_name"),
  assignedTo: text("assigned_to"),
  assigneeType: text("assignee_type"),
  assigneeId: text("assignee_id"),
  assigneeName: text("assignee_name"),
  ccRecipients: text("cc_recipients").array().notNull().default([]),
  dueDate: text("due_date"),
  lastStatusAt: timestamp("last_status_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskActivitiesTable = pgTable("task_activities", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  action: text("action").notNull(),
  actor: text("actor"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskNotificationsTable = pgTable("task_notifications", {
  id: serial("id").primaryKey(),
  recipientType: text("recipient_type").notNull(),
  recipientId: text("recipient_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  taskId: integer("task_id").notNull(),
  taskTitle: text("task_title").notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskActivity = typeof taskActivitiesTable.$inferSelect;
export type TaskNotification = typeof taskNotificationsTable.$inferSelect;
