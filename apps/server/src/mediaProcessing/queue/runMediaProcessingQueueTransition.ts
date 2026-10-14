import type { Kysely } from "kysely";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { Database } from "../../db/types/db.types.ts";

/** Shared by local handles, including handles for different catalog files. */
let pendingTransition: Promise<void> = Promise.resolve();

/**
 * Serializes processing-owned transitions before acquiring their SQLite connection.
 * A second synchronous busy wait would block the first transaction's commit.
 * SQLite's immediate transaction still arbitrates with other processes.
 *
 * Only short claim/renew/finish and output ownership/publication transitions
 * belong here. Acquire the cleanup lock before this gate when both are needed;
 * release the transaction and this gate before storage I/O. Enqueue must remain
 * callable inside an existing ingest transaction without waiting on this gate.
 */
export function runMediaProcessingQueueTransition<Result>(
  options: Readonly<{
    database: Kysely<Database>;
    callback: (transaction: Kysely<Database>) => Promise<Result>;
  }>,
): Promise<Result> {
  const result = pendingTransition.then(() => {
    return runInImmediateTransaction(options);
  });
  pendingTransition = result.then(
    () => {},
    () => {},
  );
  return result;
}
