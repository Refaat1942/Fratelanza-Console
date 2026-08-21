import type { Request, Response, NextFunction } from "express";

const PUBLIC_PATHS = new Set([
  "/healthz",
  "/version",
  "/auth/login",
  "/auth/me",
  "/auth/logout",
]);

// Writes allowed for viewers on these paths (session-related only)
const VIEWER_WRITE_ALLOW = new Set([
  "/auth/login",
  "/auth/logout",
  "/auth/verify",
]);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  // Viewer role: read-only. Block any non-GET except session ops.
  if (
    req.session.role === "viewer" &&
    req.method !== "GET" &&
    !VIEWER_WRITE_ALLOW.has(req.path)
  ) {
    res.status(403).json({ error: "Read-only account" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}
