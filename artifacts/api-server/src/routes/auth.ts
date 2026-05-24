import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

declare module "express-session" {
  interface SessionData {
    userId?: number;
    username?: string;
  }
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ success: false, error: "Username and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, String(username).toLowerCase()));
  if (!user) {
    res.status(401).json({ success: false, error: "Invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) {
    res.status(401).json({ success: false, error: "Invalid credentials" });
    return;
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.clearCookie("fratelanza.sid");
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, username: req.session.username });
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: "newPassword must be at least 6 chars" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || !(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
    res.status(401).json({ error: "Current password incorrect" });
    return;
  }
  const hash = await bcrypt.hash(String(newPassword), 10);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, user.id));
  res.json({ success: true });
});

// kept for backwards-compatibility with any prior frontend code paths
router.post("/auth/verify", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ success: false });
    return;
  }
  res.json({ success: true });
});

export default router;
