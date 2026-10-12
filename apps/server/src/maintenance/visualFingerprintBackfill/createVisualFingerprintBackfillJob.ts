import type { Job } from "../../jobs/createJobRunner.ts";
import { getFingerprintFromPhotoSource } from "./getFingerprintFromPhotoSource.ts";
import {
  getPhotoSourceFromDatabase,
  savePhotoFingerprintResult,
} from "./visualFingerprintCatalog.ts";
import type { VisualFingerprintBackfillOptions } from "./visualFingerprintBackfill.types.ts";

async function _processPhoto(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    itemId: string;
  }>,
): Promise<string> {
  const { dependencies, itemId } = options;
  const source = await getPhotoSourceFromDatabase({
    database: dependencies.database,
    itemId,
  });
  if (
    !source ||
    source.item.kind !== "photo" ||
    source.item.visual_fingerprint !== null
  ) {
    await dependencies.database
      .deleteFrom("photo_fingerprint_backfill")
      .where("item_id", "=", itemId)
      .execute();
    return "completed";
  }
  const result = await getFingerprintFromPhotoSource({ dependencies, source });
  if (dependencies.signal?.aborted) {
    return "interrupted";
  }
  return savePhotoFingerprintResult({
    database: dependencies.database,
    source,
    result,
    now: dependencies.clock(),
  });
}

async function _logProgress(
  options: Readonly<{
    dependencies: VisualFingerprintBackfillOptions;
    results: readonly string[];
  }>,
): Promise<void> {
  const { dependencies, results } = options;
  const remaining = await dependencies.database
    .selectFrom("photo_fingerprint_backfill")
    .select((expression) => {
      return expression.fn.countAll<number>().as("count");
    })
    .executeTakeFirstOrThrow();
  dependencies.logger?.info(
    {
      processed: results.length,
      completed: results.filter((result) => {
        return result === "completed";
      }).length,
      retries: results.filter((result) => {
        return result === "retry";
      }).length,
      remaining: remaining.count,
    },
    "photo fingerprint backfill progress",
  );
}

async function _runBatch(
  dependencies: Readonly<VisualFingerprintBackfillOptions>,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  const candidates = await dependencies.database
    .selectFrom("photo_fingerprint_backfill")
    .select("item_id")
    .where("next_attempt_at", "<=", dependencies.clock().toISOString())
    .orderBy("next_attempt_at")
    .orderBy("item_id")
    .limit(5)
    .execute();
  const results: string[] = [];
  await candidates.reduce(async (previous, candidate) => {
    await previous;
    if (dependencies.signal?.aborted || Date.now() >= deadline) {
      return;
    }
    results.push(
      await _processPhoto({ dependencies, itemId: candidate.item_id }),
    );
  }, Promise.resolve());
  if (results.length === 0) {
    return;
  }
  await _logProgress({ dependencies, results });
}

/** Runs automatically after startup; existing scheduler owns overlap and drain. */
export function createVisualFingerprintBackfillJob(
  options: Readonly<VisualFingerprintBackfillOptions>,
): Job {
  return {
    name: "photo-fingerprint-backfill",
    intervalMs: 30_000,
    run: () => {
      return _runBatch(options);
    },
  };
}
