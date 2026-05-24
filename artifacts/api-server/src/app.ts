import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/require-auth";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const PgSession = connectPgSimple(session);
const isProd = process.env["NODE_ENV"] === "production";
const sessionSecret = process.env["SESSION_SECRET"];
const databaseUrl = process.env["DATABASE_URL"];

if (!sessionSecret) {
  if (isProd) {
    throw new Error("SESSION_SECRET is required in production");
  }
  logger.warn("SESSION_SECRET not set — using insecure dev default");
}
const effectiveSecret = sessionSecret ?? "dev-only-insecure-secret";

app.use(
  session({
    name: "fratelanza.sid",
    store: databaseUrl
      ? new PgSession({
          conObject: { connectionString: databaseUrl },
          tableName: "session",
        })
      : undefined,
    secret: effectiveSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use("/api", requireAuth, router);

export default app;
