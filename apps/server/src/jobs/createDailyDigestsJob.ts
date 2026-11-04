import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Job } from "./createJobRunner.ts";
import { runDailyDigests } from "../mail/digests/runDailyDigests.ts";

/** Checks the Shoebox-local daily delivery opportunity once per minute. */
export function createDailyDigestsJob(
  options: Readonly<{ database: Kysely<Database>; clock: () => Date }>,
): Job {
  return {
    name: "daily-digests",
    intervalMs: 60_000,
    run: async () => {
      await runDailyDigests({
        database: options.database,
        now: options.clock().toISOString(),
      });
    },
  };
}
