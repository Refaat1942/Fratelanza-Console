import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Public deploy check — no auth required */
router.get("/version", (_req, res) => {
  res.json({
    status: "ok",
    consoleVersion: "2026.08.21-b",
    api: "fratelanza-console",
  });
});

export default router;
