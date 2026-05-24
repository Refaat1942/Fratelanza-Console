import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/require-auth";

const router: IRouter = Router();

function toShape(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    pagePermissions: u.pagePermissions ?? [],
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(usersTable.id);
  res.json(rows.map(toShape));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, password, role, pagePermissions } = req.body ?? {};
  if (!username || !password || String(password).length < 6) {
    res.status(400).json({ error: "username and password (min 6 chars) required" });
    return;
  }
  const normRole = role === "viewer" ? "viewer" : "admin";
  const perms = Array.isArray(pagePermissions) ? pagePermissions.map(String) : [];
  const passwordHash = await bcrypt.hash(String(password), 10);
  try {
    const [row] = await db.insert(usersTable).values({
      username: String(username).toLowerCase().trim(),
      passwordHash,
      role: normRole,
      pagePermissions: perms,
    }).returning();
    if (!row) {
      res.status(500).json({ error: "Failed to create user" });
      return;
    }
    res.status(201).json(toShape(row));
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const idStr = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { username, password, role, pagePermissions } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (username !== undefined) updates.username = String(username).toLowerCase().trim();
  if (role !== undefined) updates.role = role === "viewer" ? "viewer" : "admin";
  if (pagePermissions !== undefined) {
    updates.pagePermissions = Array.isArray(pagePermissions) ? pagePermissions.map(String) : [];
  }
  if (password !== undefined && password !== null && String(password).length > 0) {
    if (String(password).length < 6) {
      res.status(400).json({ error: "Password must be at least 6 chars" });
      return;
    }
    updates.passwordHash = await bcrypt.hash(String(password), 10);
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  try {
    const [row] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // If editing self, refresh session
    if (req.session.userId === id) {
      if (updates.username) req.session.username = String(updates.username);
      if (updates.role) req.session.role = String(updates.role);
      if (updates.pagePermissions) req.session.pagePermissions = updates.pagePermissions as string[];
    }
    res.json(toShape(row));
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const idStr = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (req.session.userId === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  // Prevent deleting the last admin
  const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  const target = admins.find((u) => u.id === id);
  if (target && admins.length <= 1) {
    res.status(400).json({ error: "Cannot delete the last admin" });
    return;
  }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
