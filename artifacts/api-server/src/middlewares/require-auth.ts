import type { Request, Response, NextFunction } from "express";

const PUBLIC_PATHS = new Set([
  "/healthz",
  "/auth/login",
  "/auth/me",
  "/auth/logout",
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
  next();
}
