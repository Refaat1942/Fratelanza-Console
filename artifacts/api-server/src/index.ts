import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdminUser, ensureSessionTable } from "./lib/seed-admin";
import { ensureFinanceTables, migrateLegacyFreelancerEarned, reconcileProjectPayments } from "./lib/migrate-freelancer-earned";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

void ensureSessionTable().then(() => ensureAdminUser());
void ensureFinanceTables()
  .then(() => migrateLegacyFreelancerEarned())
  .then(() => reconcileProjectPayments())
  .catch((err) => logger.error({ err }, "Finance data migration failed"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
