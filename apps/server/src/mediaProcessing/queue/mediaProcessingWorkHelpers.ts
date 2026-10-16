import type { Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import { createMediaProcessingQueue } from "./createMediaProcessingQueue.ts";
import { getMediaRecipeFromKind } from "./getMediaRecipeFromKind.ts";
import { runMediaProcessingQueueTransition } from "./runMediaProcessingQueueTransition.ts";
type EnqueueMediaProcessingOptions = {
  database: Kysely<Database>;
  itemId: string;
  now: string;
  isNewUpload?: boolean;
};

/** Enqueues catalog work inside either discovery's or ingest's transaction. */
export async function enqueueMediaProcessingWork(
  options: Readonly<EnqueueMediaProcessingOptions>,
): Promise<void> {
  const item = await options.database
    .selectFrom("items")
    .select("kind")
    .where("id", "=", options.itemId)
    .executeTakeFirst();
  if (item === undefined) {
    return;
  }
  const renditions = await options.database
    .selectFrom("item_renditions")
    .select(["id", "purpose"])
    .where("item_id", "=", options.itemId)
    .execute();
  const source = renditions.find((row) => {
    return row.purpose === "original";
  });
  if (source === undefined) {
    return;
  }
  const priority = _getPriority({
    kind: item.kind,
    renditions,
    isNewUpload: options.isNewUpload,
  });
  await createMediaProcessingQueue({
    database: options.database,
    clock: () => {
      return new Date(options.now);
    },
  }).enqueue({
    itemId: options.itemId,
    sourceRenditionId: source.id,
    recipe: getMediaRecipeFromKind(item.kind),
    priority,
  });
}

function _getPriority({
  kind,
  renditions,
  isNewUpload,
}: {
  kind: string;
  renditions: ReadonlyArray<{ purpose: string }>;
  isNewUpload: boolean | undefined;
}): number {
  const hasPreview =
    renditions.some((row) => {
      return row.purpose === "thumb";
    }) &&
    renditions.some((row) => {
      return row.purpose === (kind === "video" ? "poster" : "display");
    });
  return hasPreview ? (isNewUpload ? 50 : 10) : 100;
}

/**
 * Advances one durable catalog-only page, wrapping to requalify changed policy.
 */
export async function discoverMediaProcessingWork(
  options: Readonly<{
    database: Kysely<Database>;
    now: string;
    limit: number;
  }>,
): Promise<{ scanned: number; hasMore: boolean }> {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
    throw new Error("processing_discovery_limit_invalid");
  }
  return runMediaProcessingQueueTransition({
    database: options.database,
    callback: async (database) => {
      return _discoverPage({
        database,
        now: options.now,
        limit: Math.min(100, options.limit),
      });
    },
  });
}

async function _discoverPage({
  database,
  now,
  limit,
}: {
  database: Kysely<Database>;
  now: string;
  limit: number;
}): Promise<{ scanned: number; hasMore: boolean }> {
  const cursor = await database
    .selectFrom("media_processing_discovery")
    .select("cursor_item_id")
    .where("id", "=", 1)
    .executeTakeFirstOrThrow();
  const rows = await database
    .selectFrom("items")
    .select("id")
    .where("id", ">", cursor.cursor_item_id ?? "")
    .orderBy("id")
    .limit(limit + 1)
    .execute();
  const page = rows.slice(0, limit);
  await page.reduce(async (previous, row) => {
    await previous;
    await enqueueMediaProcessingWork({
      database,
      itemId: row.id,
      now,
    });
  }, Promise.resolve());
  const hasMore = rows.length > limit;
  await database
    .updateTable("media_processing_discovery")
    .set({
      cursor_item_id: hasMore ? page.at(-1)!.id : null,
      updated_at: now,
    })
    .where("id", "=", 1)
    .execute();
  return { scanned: page.length, hasMore };
}
