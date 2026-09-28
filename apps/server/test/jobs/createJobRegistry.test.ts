import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { SCHEMA_MANIFEST } from "../../src/db/schemaManifest/schemaManifest.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createJobRegistry } from "../../src/jobs/createJobRegistry.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";

/**
 * Every row in every table, so two of these can be compared.
 *
 * `SCHEMA_MANIFEST` is the table list rather than a hand-written one, so a
 * table a later migration adds is covered here without anybody remembering to
 * add it.
 */
async function snapshotEveryTable(database: Kysely<Database>) {
  const tableNames = Object.keys(SCHEMA_MANIFEST) as Array<keyof Database>;
  const tables = await Promise.all(
    tableNames.map(async (tableName) => {
      const rows = await database.selectFrom(tableName).selectAll().execute();
      return [tableName, rows] as const;
    }),
  );
  return Object.fromEntries(tables);
}

async function createRegistry() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const jobs = createJobRegistry({
    database,
    b2: createFakeB2Client(),
    clock: () => {
      return new Date("2026-09-27T10:00:00.000Z");
    },
  });
  return { database, jobs };
}

describe("createJobRegistry", () => {
  it("registers the seven jobs conventions.md names, with their cadences", async () => {
    const { database, jobs } = await createRegistry();

    expect(
      jobs.map((job) => {
        return [job.name, job.intervalMs];
      }),
    ).toEqual([
      ["session-sweep", 3_600_000],
      ["invitation-lapse", 3_600_000],
      ["sign-in-code-sweep", 3_600_000],
      ["upload-abandon-sweep", 900_000],
      ["removal-reminder", 3_600_000],
      ["object-deletion-drain", 300_000],
      ["visibility-rule-sweep", 86_400_000],
    ]);
    await database.destroy();
  });

  it("runs every job twice against an empty database without failing or changing anything", async () => {
    const { database, jobs } = await createRegistry();
    const before = await snapshotEveryTable(database);

    for (const job of jobs) {
      await job.run();
      await job.run();
    }

    // A job that threw would take the whole schedule with it on a fresh
    // instance, so reaching this line at all is half the test. The other half
    // is that nothing moved: a sweep with nothing to sweep must not write, and
    // the second run must not undo or repeat the first.
    expect(await snapshotEveryTable(database)).toEqual(before);
    await database.destroy();
  });
});
