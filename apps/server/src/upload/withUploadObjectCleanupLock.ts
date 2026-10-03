import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Completion gates for object cleanup and retry restoration on each catalog. */
const CLEANUP_GATES = new WeakMap<DatabaseExecutor, Promise<void>>();

/**
 * Runs cleanup or retry restoration exclusively against the shared catalog.
 *
 * Pass the root database handle used by routes and jobs. The gate spans object
 * deletion without holding a SQLite transaction, so a retry cannot reuse a key
 * until its in-flight deletion finishes. Failures release the next caller too.
 */
export async function withUploadObjectCleanupLock<Result>(
  options: Readonly<{
    database: DatabaseExecutor;
    callback: () => Promise<Result>;
  }>,
): Promise<Result> {
  const previousGate = CLEANUP_GATES.get(options.database);
  const gate = Promise.withResolvers<void>();
  CLEANUP_GATES.set(options.database, gate.promise);
  await previousGate;
  try {
    return await options.callback();
  } finally {
    gate.resolve();
    if (CLEANUP_GATES.get(options.database) === gate.promise) {
      CLEANUP_GATES.delete(options.database);
    }
  }
}
