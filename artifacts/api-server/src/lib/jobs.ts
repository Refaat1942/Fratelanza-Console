import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { logger } from "./logger";

/**
 * Long AI requests (reading a proposal can take minutes) run as background jobs:
 * a proxy in front of the API (nginx: 60 s by default) would otherwise cut them off.
 * The caller adds ?async=1, gets { jobId } at once, and polls GET /ai/jobs/:id.
 */
type Job = { status: "running" | "done" | "error"; code: number; body: unknown; owner: number | undefined; at: number };
const jobs = new Map<string, Job>();
const TTL = 30 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.at > TTL) jobs.delete(id);
}

type Handler = (req: Request, res: Response) => Promise<void>;

/** Run `handler` as a job when the request asks for it (?async=1), else as usual. */
export function jobbable(handler: Handler): RequestHandler {
  return (req, res, next) => {
    if (req.query.async !== "1") {
      handler(req, res).catch(next);
      return;
    }
    sweep();
    const id = randomUUID();
    const job: Job = { status: "running", code: 200, body: null, owner: req.session?.userId, at: Date.now() };
    jobs.set(id, job);
    // A stand-in response that keeps what the handler sends
    const capture = {
      status(code: number) { job.code = code; return capture; },
      json(body: unknown) { job.body = body; job.status = job.code < 400 ? "done" : "error"; job.at = Date.now(); return capture; },
    } as unknown as Response;
    handler(req, capture).catch((err: unknown) => {
      logger.error({ err }, "AI job failed");
      job.status = "error";
      job.code = 500;
      job.body = { error: (err as Error).message || "AI request failed" };
    });
    res.status(202).json({ jobId: id });
  };
}

/** GET /ai/jobs/:id — { status: "running" } until the result (or the error) is there. */
export const jobStatus: RequestHandler = (req, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || (job.owner !== undefined && job.owner !== req.session?.userId)) {
    res.status(404).json({ error: "This AI request has expired. Please try again." });
    return;
  }
  if (job.status === "running") {
    res.json({ status: "running" });
    return;
  }
  jobs.delete(String(req.params.id));
  res.status(job.code).json(job.body);
};
