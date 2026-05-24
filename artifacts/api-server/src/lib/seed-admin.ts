import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureSessionTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "username" text NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
        ) THEN
          ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        END IF;
      END $$;
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);
    logger.info("Session table ready");
  } catch (err) {
    logger.error({ err }, "Failed to create session table");
  }
}

export async function ensureAdminUser(): Promise<void> {
  const isProd = process.env["NODE_ENV"] === "production";
  const username = (process.env["ADMIN_USERNAME"] ?? "admin").toLowerCase();
  const explicitPassword = process.env["ADMIN_PASSWORD"] ?? process.env["MASTER_PASSWORD"];

  if (isProd && !explicitPassword) {
    logger.warn("ADMIN_PASSWORD not set in production — skipping admin seed. Set ADMIN_PASSWORD and restart.");
    return;
  }
  const password = explicitPassword ?? "fratelanza2024";

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing) {
      logger.info({ username }, "Admin user already exists");
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({ username, passwordHash });
    logger.info({ username }, "Created initial admin user");
  } catch (err) {
    logger.error({ err }, "Failed to ensure admin user");
  }
}
