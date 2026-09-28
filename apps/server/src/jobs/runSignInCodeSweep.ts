import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";

/** What one run removed. */
export type SignInCodeSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes expired and consumed `sign_in_codes` rows.
 *
 * The codes are stored as an HMAC rather than in the clear, so this is not
 * what protects them: it is what stops a table of dead hashes growing forever
 * beside the addresses they were sent to.
 */
export async function runSignInCodeSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<SignInCodeSweepSummary> {
  const result = await options.database
    .deleteFrom("sign_in_codes")
    .where((eb) => {
      return eb.or([
        eb("expires_at", "<=", options.now),
        eb("consumed_at", "is not", null),
      ]);
    })
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
