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
        "role" text NOT NULL DEFAULT 'admin',
        "page_permissions" text[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'admin';`);
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "page_permissions" text[] NOT NULL DEFAULT '{}';`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "general_expenses" (
        "id" serial PRIMARY KEY,
        "description" text NOT NULL,
        "amount" numeric(12, 2) NOT NULL DEFAULT '0',
        "category" text NOT NULL DEFAULT 'Other',
        "date" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`ALTER TABLE "general_expenses" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'Other';`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" serial PRIMARY KEY,
        "title" text NOT NULL,
        "description" text,
        "status" text NOT NULL DEFAULT 'Todo',
        "priority" text DEFAULT 'Medium',
        "project_id" integer,
        "project_name" text,
        "assigned_to" text,
        "assignee_type" text,
        "assignee_id" text,
        "assignee_name" text,
        "cc_recipients" text[] NOT NULL DEFAULT '{}',
        "due_date" text,
        "last_status_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_type" text;`);
    await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_id" text;`);
    await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_name" text;`);
    await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "cc_recipients" text[] NOT NULL DEFAULT '{}';`);
    await db.execute(sql`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "last_status_at" timestamptz;`);
    await db.execute(sql`UPDATE "tasks" SET "status" = 'To Do' WHERE "status" = 'Todo';`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "task_activities" (
        "id" serial PRIMARY KEY,
        "task_id" integer NOT NULL,
        "action" text NOT NULL,
        "actor" text,
        "from_status" text,
        "to_status" text,
        "details" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_task_activities_task_id" ON "task_activities" ("task_id");`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "task_notifications" (
        "id" serial PRIMARY KEY,
        "recipient_type" text NOT NULL,
        "recipient_id" text NOT NULL,
        "recipient_name" text NOT NULL,
        "task_id" integer NOT NULL,
        "task_title" text NOT NULL,
        "message" text NOT NULL,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_task_notifications_recipient" ON "task_notifications" ("recipient_type", "recipient_id", "read_at");`);
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
