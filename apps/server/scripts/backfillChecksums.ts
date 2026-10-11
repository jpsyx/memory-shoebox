import { createB2Client } from "../src/b2/createB2Client/createB2Client.ts";
import { getConfig } from "../src/configHelpers.ts";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { backfillChecksums } from "../src/maintenance/checksumBackfill/backfillChecksums.ts";

async function _runCli(): Promise<void> {
  const config = getConfig();
  const database = createDatabase(config.databasePath);
  try {
    await migrateToLatest(database);
    const result = await backfillChecksums({
      database,
      b2: createB2Client(config.b2),
    });
    console.log(
      `Checksum backfill: updated=${result.updated} failed=${result.failed}`,
    );
    process.exitCode = result.failed > 0 ? 1 : 0;
  } finally {
    await database.destroy();
  }
}

_runCli().catch(() => {
  // SDK/fetch errors can contain signed URLs or credentials. Never print them.
  console.error(
    "Checksum backfill could not complete. Check server configuration, migration history, backup directory access, and available disk space.",
  );
  process.exitCode = 1;
});
