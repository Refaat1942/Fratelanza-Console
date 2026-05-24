import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import {
  freelancersTable,
  taskActivitiesTable,
  taskNotificationsTable,
  tasksTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql, or, isNull, desc } from "drizzle-orm";

const router: IRouter = Router();

type RecipientType = "team_member" | "freelancer";
type TaskRecipient = {
  type: RecipientType;
  id: string;
  name: string;
  category: "Team Members" | "Freelancers";
};

type Assignee = TaskRecipient & { value: string };

const VALID_STATUSES = new Set(["Todo", "In Progress", "Done"]);

function recipientValue(type: RecipientType, id: string): string {
  return `${type}:${id}`;
}

function encodeRecipient(recipient: TaskRecipient): string {
  return JSON.stringify(recipient);
}

function decodeRecipient(value: string): TaskRecipient | null {
  try {
    const parsed = JSON.parse(value) as Partial<TaskRecipient>;
    if ((parsed.type === "team_member" || parsed.type === "freelancer") && parsed.id && parsed.name) {
      return {
        type: parsed.type,
        id: String(parsed.id),
        name: String(parsed.name),
        category: parsed.type === "team_member" ? "Team Members" : "Freelancers",
      };
    }
  } catch {
    // Legacy CC values may be plain strings; ignore invalid encoded recipients.
  }
  return null;
}

function decodeRecipients(values: string[] | null | undefined): TaskRecipient[] {
  return (values ?? []).map(decodeRecipient).filter((r): r is TaskRecipient => Boolean(r));
}

function toShape(r: typeof tasksTable.$inferSelect) {
  const ccRecipients = decodeRecipients(r.ccRecipients);
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    projectId: r.projectId,
    projectName: r.projectName,
    assignedTo: r.assignedTo,
    assigneeType: r.assigneeType,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName ?? r.assignedTo,
    assigneeValue: r.assigneeType && r.assigneeId ? recipientValue(r.assigneeType as RecipientType, r.assigneeId) : null,
    ccRecipients,
    dueDate: r.dueDate,
    lastStatusAt: r.lastStatusAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function notificationShape(r: typeof taskNotificationsTable.$inferSelect) {
  return {
    id: r.id,
    recipientType: r.recipientType,
    recipientId: r.recipientId,
    recipientName: r.recipientName,
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    message: r.message,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function activityShape(r: typeof taskActivitiesTable.$inferSelect) {
  return {
    id: r.id,
    taskId: r.taskId,
    action: r.action,
    actor: r.actor,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
  };
}

async function listAssignees(): Promise<Assignee[]> {
  const [users, freelancers] = await Promise.all([
    db.select().from(usersTable).orderBy(usersTable.username),
    db.select().from(freelancersTable).orderBy(freelancersTable.name),
  ]);

  return [
    ...users.map((u) => ({
      type: "team_member" as const,
      id: u.username,
      name: u.username,
      category: "Team Members" as const,
      value: recipientValue("team_member", u.username),
    })),
    ...freelancers.map((f) => ({
      type: "freelancer" as const,
      id: f.code,
      name: f.name,
      category: "Freelancers" as const,
      value: recipientValue("freelancer", f.code),
    })),
  ];
}

async function resolveRecipientFromBody(body: Record<string, unknown>): Promise<TaskRecipient | null> {
  const assignees = await listAssignees();
  const value = typeof body.assigneeValue === "string" ? body.assigneeValue : null;
  if (value) {
    const found = assignees.find((a) => a.value === value);
    if (found) return found;
  }

  const type = body.assigneeType === "team_member" || body.assigneeType === "freelancer" ? body.assigneeType : null;
  const id = typeof body.assigneeId === "string" ? body.assigneeId : null;
  if (type && id) {
    const found = assignees.find((a) => a.type === type && a.id === id);
    if (found) return found;
  }

  if (typeof body.assignedTo === "string" && body.assignedTo.trim()) {
    return {
      type: "team_member",
      id: body.assignedTo.trim().toLowerCase(),
      name: body.assignedTo.trim(),
      category: "Team Members",
    };
  }

  return null;
}

async function resolveCcRecipients(body: Record<string, unknown>, assignee: TaskRecipient | null): Promise<TaskRecipient[]> {
  const raw = Array.isArray(body.ccRecipients) ? body.ccRecipients : [];
  const assignees = await listAssignees();
  const recipients: TaskRecipient[] = [];

  for (const item of raw) {
    if (typeof item === "string") {
      const found = assignees.find((a) => a.value === item) ?? decodeRecipient(item);
      if (found) recipients.push(found);
    } else if (item && typeof item === "object") {
      const candidate = item as Partial<TaskRecipient>;
      if ((candidate.type === "team_member" || candidate.type === "freelancer") && candidate.id && candidate.name) {
        recipients.push({
          type: candidate.type,
          id: String(candidate.id),
          name: String(candidate.name),
          category: candidate.type === "team_member" ? "Team Members" : "Freelancers",
        });
      }
    }
  }

  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = recipientValue(r.type, r.id);
    if (assignee && key === recipientValue(assignee.type, assignee.id)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function taskChangedAssignment(oldTask: typeof tasksTable.$inferSelect, assignee: TaskRecipient | null): boolean {
  return (oldTask.assigneeType ?? null) !== (assignee?.type ?? null) ||
    (oldTask.assigneeId ?? null) !== (assignee?.id ?? null);
}

async function recordActivity(input: {
  taskId: number;
  action: string;
  actor?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  details?: string | null;
}): Promise<void> {
  await db.insert(taskActivitiesTable).values({
    taskId: input.taskId,
    action: input.action,
    actor: input.actor ?? null,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    details: input.details ?? null,
  });
}

async function createNotifications(task: typeof tasksTable.$inferSelect, recipients: TaskRecipient[], message: string): Promise<void> {
  const seen = new Set<string>();
  const rows = recipients.filter((r) => {
    const key = recipientValue(r.type, r.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((r) => ({
    recipientType: r.type,
    recipientId: r.id,
    recipientName: r.name,
    taskId: task.id,
    taskTitle: task.title,
    message,
  }));

  if (rows.length > 0) {
    await db.insert(taskNotificationsTable).values(rows);
  }
}

function currentActor(req: Request): string | null {
  return req.session?.username ?? null;
}

router.get("/task-assignees", async (_req, res): Promise<void> => {
  const assignees = await listAssignees();
  res.json({
    teamMembers: assignees.filter((a) => a.type === "team_member"),
    freelancers: assignees.filter((a) => a.type === "freelancer"),
  });
});

router.get("/task-notifications", async (req, res): Promise<void> => {
  const username = req.session?.username;
  const conditions = [eq(taskNotificationsTable.recipientType, "freelancer")];
  if (username) {
    conditions.push(and(eq(taskNotificationsTable.recipientType, "team_member"), eq(taskNotificationsTable.recipientId, username))!);
  }

  const rows = await db
    .select()
    .from(taskNotificationsTable)
    .where(or(...conditions))
    .orderBy(desc(taskNotificationsTable.createdAt))
    .limit(25);

  const unreadCount = rows.filter((r) => !r.readAt).length;
  res.json({ unreadCount, items: rows.map(notificationShape) });
});

router.post("/task-notifications/read", async (req, res): Promise<void> => {
  const username = req.session?.username;
  const conditions = [eq(taskNotificationsTable.recipientType, "freelancer")];
  if (username) {
    conditions.push(and(eq(taskNotificationsTable.recipientType, "team_member"), eq(taskNotificationsTable.recipientId, username))!);
  }

  await db
    .update(taskNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(or(...conditions)!, isNull(taskNotificationsTable.readAt)));

  res.json({ success: true });
});

router.get("/tasks", async (req, res): Promise<void> => {
  const { status, projectId } = req.query as Record<string, string>;
  const conditions = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (projectId) conditions.push(eq(tasksTable.projectId, parseInt(projectId, 10)));

  const rows = conditions.length
    ? await db.select().from(tasksTable).where(and(...conditions)).orderBy(sql`created_at desc`)
    : await db.select().from(tasksTable).orderBy(sql`created_at desc`);

  res.json(rows.map(toShape));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const assignee = await resolveRecipientFromBody(body);
  const ccRecipients = await resolveCcRecipients(body, assignee);
  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : "Todo";

  const [row] = await db.insert(tasksTable).values({
    title: body.title,
    description: body.description ?? null,
    status,
    priority: body.priority ?? "Medium",
    projectId: body.projectId ?? null,
    projectName: body.projectName ?? null,
    assignedTo: assignee?.name ?? body.assignedTo ?? null,
    assigneeType: assignee?.type ?? null,
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    ccRecipients: ccRecipients.map(encodeRecipient),
    dueDate: body.dueDate ?? null,
    lastStatusAt: new Date(),
  }).returning();

  await recordActivity({
    taskId: row.id,
    action: "created",
    actor: currentActor(req),
    toStatus: status,
    details: assignee ? `Assigned to ${assignee.category}: ${assignee.name}` : "Task created",
  });

  const notificationRecipients = assignee ? [assignee, ...ccRecipients] : ccRecipients;
  await createNotifications(row, notificationRecipients, `New task assigned: ${row.title}`);

  res.status(201).json(toShape(row));
});

router.get("/tasks/:id/activity", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const rows = await db
    .select()
    .from(taskActivitiesTable)
    .where(eq(taskActivitiesTable.taskId, id))
    .orderBy(desc(taskActivitiesTable.createdAt));
  res.json(rows.map(activityShape));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const body = req.body ?? {};
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const assignee: TaskRecipient | null = body.assigneeValue !== undefined || body.assigneeType !== undefined || body.assigneeId !== undefined || body.assignedTo !== undefined
    ? await resolveRecipientFromBody(body)
    : existing.assigneeType && existing.assigneeId
      ? {
          type: existing.assigneeType as RecipientType,
          id: existing.assigneeId,
          name: existing.assigneeName ?? existing.assignedTo ?? existing.assigneeId,
          category: existing.assigneeType === "freelancer" ? "Freelancers" : "Team Members",
        }
      : null;
  const assignmentChanged = taskChangedAssignment(existing, assignee);
  const ccRecipients = body.ccRecipients !== undefined ? await resolveCcRecipients(body, assignee) : decodeRecipients(existing.ccRecipients);
  const statusChanged = typeof body.status === "string" && body.status !== existing.status;

  const updates: Record<string, unknown> = {};
  const textFields = ["title", "description", "status", "priority", "projectName", "dueDate"];
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.projectId !== undefined) updates.projectId = body.projectId === null ? null : Number(body.projectId);
  if (body.assigneeValue !== undefined || body.assigneeType !== undefined || body.assigneeId !== undefined || body.assignedTo !== undefined) {
    updates.assignedTo = assignee?.name ?? null;
    updates.assigneeType = assignee?.type ?? null;
    updates.assigneeId = assignee?.id ?? null;
    updates.assigneeName = assignee?.name ?? null;
  }
  if (body.ccRecipients !== undefined) updates.ccRecipients = ccRecipients.map(encodeRecipient);
  if (statusChanged) updates.lastStatusAt = new Date();

  const [row] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (statusChanged) {
    await recordActivity({
      taskId: row.id,
      action: "status_changed",
      actor: currentActor(req),
      fromStatus: existing.status,
      toStatus: row.status,
      details: `Status changed from ${existing.status} to ${row.status}`,
    });
  } else {
    await recordActivity({
      taskId: row.id,
      action: assignmentChanged ? "assignment_changed" : "updated",
      actor: currentActor(req),
      details: assignmentChanged && assignee ? `Assigned to ${assignee.category}: ${assignee.name}` : "Task details updated",
    });
  }

  if (assignmentChanged && assignee) {
    await createNotifications(row, [assignee, ...ccRecipients], `Task assigned to ${assignee.name}: ${row.title}`);
  } else if (body.ccRecipients !== undefined && ccRecipients.length > 0) {
    await createNotifications(row, ccRecipients, `You were added in CC: ${row.title}`);
  }

  res.json(toShape(row));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [deleted] = await db.delete(tasksTable).where(eq(tasksTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  await recordActivity({ taskId: id, action: "deleted", actor: currentActor(req), details: `Task deleted: ${deleted.title}` });
  res.sendStatus(204);
});

export default router;
