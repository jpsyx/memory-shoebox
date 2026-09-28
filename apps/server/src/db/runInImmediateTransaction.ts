import { sql, type Kysely } from "kysely";
import type { Database } from "./types/db.types.ts";

/**
 * Runs `callback` inside a `BEGIN IMMEDIATE` transaction.
 *
 * **Kysely's own `transaction()` is not enough here.** Its SQLite dialect
 * issues a deferred `BEGIN`, which takes the write lock at the first write, so
 * two submissions of the same sign-in code can both read `attempts = 0` before
 * either increments it and each gets three tries. `data-models.md`
 * § `sign_in_codes` requires one transaction for exactly this reason, and
 * `IMMEDIATE` is what makes it one: the lock is taken at the start.
 *
 * `connection()` is what pins every statement, including the `BEGIN`, to a
 * single connection.
 *
 * @param options.database The Kysely handle.
 * @param options.callback Receives a handle bound to the transaction. Use it,
 *   not the outer handle, or the write lands outside the transaction.
 * @returns Whatever the callback returned, once committed.
 */
export async function runInImmediateTransaction<Result>(options: {
  database: Kysely<Database>;
  callback: (transaction: Kysely<Database>) => Promise<Result>;
}): Promise<Result> {
  return options.database.connection().execute(async (connection) => {
    await sql`begin immediate`.execute(connection);
    try {
      const result = await options.callback(connection);
      await sql`commit`.execute(connection);
      return result;
    } catch (error) {
      await sql`rollback`.execute(connection);
      throw error;
    }
  });
}
