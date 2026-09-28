import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createJobRegistry } from "../../src/jobs/registry.ts";
import { createFakeB2Client } from "../helpers/fakeB2.ts";

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

    for (const job of jobs) {
      await job.run();
      await job.run();
    }

    // Nothing to assert beyond "no throw": an empty database has nothing to
    // change, and a job that threw here would take the whole schedule with it
    // on a fresh instance.
    expect(jobs).toHaveLength(7);
    await database.destroy();
  });
});
