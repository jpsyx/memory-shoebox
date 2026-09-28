import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";

/** What one run removed. */
export type SessionSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes `sessions` rows past `expires_at`.
 *
 * **Housekeeping, not security** (`conventions.md` § The job runner). The
 * session is looked up in the database on every request, so an expired row is
 * already dead and this only stops the table growing. Nothing may come to
 * depend on the sweep having run.
 */
export async function runSessionSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<SessionSweepSummary> {
  const result = await options.database
    .deleteFrom("sessions")
    .where("expires_at", "<=", options.now)
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
