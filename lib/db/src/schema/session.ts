import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Managed by connect-pg-simple. Declared here so drizzle-kit push doesn't try to drop it.
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
