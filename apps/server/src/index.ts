/**
 * Production entry point.
 *
 * Reads configuration from the environment, opens and migrates the SQLite
 * catalog, then starts the HTTP server. Run it with `pnpm start` (or
 * `pnpm dev` for watch mode). Node executes this TypeScript directly, so
 * there is no build step for the server.
 */
import { createApp } from "./app.ts";
import { getConfig } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { migrateToLatest } from "./db/migrate.ts";

const config = getConfig();
const database = createDatabase(config.databasePath);
await migrateToLatest(database);

const app = await createApp({ config, database, startBackgroundWork: true });

// Fly.io stops a machine with SIGTERM. Close the server and the database so
// in-flight requests finish and SQLite checkpoints cleanly.
const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  await database.destroy();
  process.exit(0);
};

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.once(signal, () => {
    void shutdown(signal);
  });
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
