import { pgTable, text, serial, timestamp, integer, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Files uploaded on a client's page (any type), with a name chosen by the user. */
export const clientDocumentsTable = pgTable("client_documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  /** Display name typed by the user, e.g. "Signed contract" */
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientDocument = typeof clientDocumentsTable.$inferSelect;
