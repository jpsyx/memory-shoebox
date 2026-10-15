/** Local acceptance entry point: real workers, isolated storage, no mail delivery. */
import { createApp } from "../../apps/server/src/createApp.ts";
import { getConfig } from "../../apps/server/src/configHelpers.ts";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { migrateToLatest } from "../../apps/server/src/db/migrate.ts";
import {
  E2E_DATABASE_PATH,
  E2E_FAKE_S3_URL,
} from "./e2eEnvironment.constants.ts";

const config = getConfig();
if (
  config.nodeEnv !== "development" ||
  !config.enableFakeEmail ||
  config.databasePath !== E2E_DATABASE_PATH ||
  config.b2.endpoint !== E2E_FAKE_S3_URL ||
  config.resendApiKey ||
  config.upstashRedisRestUrl ||
  config.upstashRedisRestToken
) {
  throw new Error("Refusing unsafe local acceptance configuration");
}
console.info(
  "Local E2E runtime",
  JSON.stringify({
    nodeEnv: config.nodeEnv,
    enableFakeEmail: config.enableFakeEmail,
    emailService: "none",
    mailDomainReader: "none",
    databasePath: config.databasePath,
    bucketEndpoint: config.b2.endpoint,
  }),
);
const database = createDatabase(config.databasePath);
await migrateToLatest(database);
const app = await createApp({
  config,
  database,
  emailService: "none",
  mailDomainReader: "none",
  startBackgroundWork: true,
});
const shutdown = async (): Promise<void> => {
  await app.close();
  await database.destroy();
  process.exit(0);
};
["SIGTERM", "SIGINT"].forEach((signal) => {
  process.once(signal, () => {
    void shutdown();
  });
});
try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  await app.close();
  await database.destroy();
  throw error;
}
