import * as schema from "@workspace/db";
import { db } from "@workspace/db";
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { logger } from "./logger";

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (v: unknown) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));

/**
 * Bring existing tables up to the current schema: every column the code
 * expects but the database lacks is added (older servers whose migrations
 * missed a column would otherwise fail with "column does not exist").
 * Columns with a plain default are added NOT NULL with that default; the
 * rest are added nullable so existing rows stay valid. Missing tables are
 * left to the code that creates them.
 */
export async function ensureSchemaColumns(): Promise<void> {
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const { name: table, columns } = getTableConfig(value);
    const existing = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table}`);
    const have = new Set((existing.rows as { column_name: string }[]).map((r) => r.column_name));
    if (have.size === 0) continue; // table not created yet
    for (const col of columns) {
      if (have.has(col.name) || col.primary) continue;
      const plainDefault = col.hasDefault && ["string", "number", "boolean"].includes(typeof col.default);
      const type = col.getSQLType();
      const ddl = `ALTER TABLE ${ident(table)} ADD COLUMN IF NOT EXISTS ${ident(col.name)} ${type}`
        + (plainDefault ? ` DEFAULT ${literal(col.default)}${col.notNull ? " NOT NULL" : ""}`
          : type.startsWith("timestamp") && col.hasDefault ? " DEFAULT now()" : "");
      try {
        await db.execute(sql.raw(ddl));
        logger.info({ table, column: col.name }, "Added missing column");
      } catch (err) {
        logger.error({ err, table, column: col.name }, "Could not add missing column");
      }
    }
  }
}
