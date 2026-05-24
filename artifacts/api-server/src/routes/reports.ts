import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  expensesTable,
  freelancerPaymentTermsTable,
  freelancersTable,
  projectReceivablesTable,
  projectsTable,
  taskActivitiesTable,
  taskNotificationsTable,
  tasksTable,
  usersTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
}

function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

router.get("/reports/system-activity.xlsx", async (_req, res): Promise<void> => {
  const [tasks, activities, notifications, users, freelancers, projects, expenses, clientReceivables, freelancerPaymentTerms] = await Promise.all([
    db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
    db.select().from(taskActivitiesTable).orderBy(desc(taskActivitiesTable.createdAt)),
    db.select().from(taskNotificationsTable).orderBy(desc(taskNotificationsTable.createdAt)),
    db.select().from(usersTable).orderBy(usersTable.username),
    db.select().from(freelancersTable).orderBy(freelancersTable.name),
    db.select().from(projectsTable).orderBy(desc(projectsTable.date)),
    db.select().from(expensesTable).orderBy(desc(expensesTable.createdAt)),
    db.select().from(projectReceivablesTable).orderBy(desc(projectReceivablesTable.createdAt)),
    db.select().from(freelancerPaymentTermsTable).orderBy(desc(freelancerPaymentTermsTable.createdAt)),
  ]);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks.map((t) => ({
    ID: t.id,
    Title: t.title,
    Description: t.description ?? "",
    Status: t.status,
    Priority: t.priority ?? "",
    Project: t.projectName ?? "",
    AssigneeCategory: t.assigneeType === "freelancer" ? "Freelancers" : t.assigneeType === "team_member" ? "Team Members" : "",
    Assignee: t.assigneeName ?? t.assignedTo ?? "",
    CCCount: t.ccRecipients?.length ?? 0,
    DueDate: t.dueDate ?? "",
    LastStatusAt: iso(t.lastStatusAt) ?? "",
    CreatedAt: iso(t.createdAt) ?? "",
  }))), "Tasks");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activities.map((a) => ({
    ID: a.id,
    TaskID: a.taskId,
    Action: a.action,
    Actor: a.actor ?? "",
    FromStatus: a.fromStatus ?? "",
    ToStatus: a.toStatus ?? "",
    Details: a.details ?? "",
    CreatedAt: iso(a.createdAt) ?? "",
  }))), "Task Activity");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notifications.map((n) => ({
    ID: n.id,
    RecipientCategory: n.recipientType === "freelancer" ? "Freelancers" : "Team Members",
    Recipient: n.recipientName,
    TaskID: n.taskId,
    TaskTitle: n.taskTitle,
    Message: n.message,
    ReadAt: iso(n.readAt) ?? "Unread",
    CreatedAt: iso(n.createdAt) ?? "",
  }))), "Notifications");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(users.map((u) => ({
    ID: u.id,
    Category: "Team Members",
    Username: u.username,
    Role: u.role,
    PagePermissions: (u.pagePermissions ?? []).join(", "),
    CreatedAt: iso(u.createdAt) ?? "",
  }))), "Team Members");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(freelancers.map((f) => ({
    Code: f.code,
    Category: "Freelancers",
    Name: f.name,
    Phone: f.phone ?? "",
    Specialization: f.spec ?? "",
    Position: f.position ?? "",
    Earned: numberValue(f.earned),
    Balance: numberValue(f.balance),
    Rating: numberValue(f.rating),
    CreatedAt: iso(f.createdAt) ?? "",
  }))), "Freelancers");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projects.map((p) => ({
    ID: p.id,
    Type: p.type,
    Project: p.projectName,
    Client: p.clientName ?? "",
    Revenue: numberValue(p.clientPrice),
    TotalCost: numberValue(p.totalCost),
    NetProfit: numberValue(p.netProfit),
    LeadFreelancer: p.freelancerName ?? "",
    LeadCommission: numberValue(p.freelancerCommission),
    Status: p.status,
    Paid: numberValue(p.paidAmount),
    Remaining: numberValue(p.remainingAmount),
    NextPaymentDate: p.nextPaymentDate ?? "",
    Date: iso(p.date) ?? "",
  }))), "Projects");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses.map((e) => ({
    ID: e.id,
    Description: e.description,
    Category: e.category,
    Amount: numberValue(e.amount),
    Date: e.date ?? "",
    CreatedAt: iso(e.createdAt) ?? "",
  }))), "Expenses");


  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientReceivables.map((r) => ({
    ID: r.id,
    ProjectID: r.projectId,
    Amount: numberValue(r.amount),
    DueDate: r.dueDate ?? "",
    Note: r.note ?? "",
    Status: r.status,
    PaidAt: r.paidAt ?? "",
    CreatedAt: iso(r.createdAt) ?? "",
  }))), "Client Receivables");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(freelancerPaymentTerms.map((r) => ({
    ID: r.id,
    ProjectID: r.projectId,
    Freelancer: r.freelancerName,
    Amount: numberValue(r.amount),
    DueDate: r.dueDate ?? "",
    Note: r.note ?? "",
    Status: r.status,
    PaidAt: r.paidAt ?? "",
    CreatedAt: iso(r.createdAt) ?? "",
  }))), "Freelancer Terms");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="fratelanza-system-report-${stamp}.xlsx"`);
  res.send(buffer);
});

export default router;
