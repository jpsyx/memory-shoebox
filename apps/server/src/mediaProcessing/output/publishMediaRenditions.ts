import { type Selectable, sql, type Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import { createId } from "../../db/createId.ts";
import { withUploadObjectCleanupLock } from "../../upload/withUploadObjectCleanupLock.ts";
import { runMediaProcessingQueueTransition } from "../queue/runMediaProcessingQueueTransition.ts";
import type { ProcessingClaim } from "../queue/mediaProcessingQueue.types.ts";
import type { ProcessedRendition } from "../recipes/mediaRecipes.types.ts";

type PublicationOptions = {
  database: Kysely<Database>;
  claim: Readonly<ProcessingClaim>;
  outputs: ReadonlyArray<{ outputId: string; rendition: ProcessedRendition }>;
  clock: () => Date;
  signal: AbortSignal;
};

const OWNERSHIP_LOST = Symbol("processing_publication_ownership_lost");

function _getAttemptTime({
  options,
  expiry,
}: {
  options: Readonly<PublicationOptions>;
  expiry?: string;
}): string {
  const now = options.clock().toISOString();
  if (options.signal.aborted || (expiry !== undefined && now >= expiry)) {
    throw OWNERSHIP_LOST;
  }
  return now;
}

async function _getLiveSourceExpiry(
  options: Readonly<PublicationOptions>,
): Promise<string> {
  const { database, claim } = options;
  const now = _getAttemptTime({ options });
  const job = await database
    .selectFrom("media_processing_jobs as job")
    .innerJoin(
      "item_renditions as source",
      "source.id",
      "job.source_rendition_id",
    )
    .select("job.lease_expires_at")
    .where("job.id", "=", claim.jobId)
    .where("job.item_id", "=", claim.itemId)
    .where("source.item_id", "=", claim.itemId)
    .where("source.purpose", "=", "original")
    .where("source.id", "=", claim.sourceRenditionId)
    .where("job.recipe", "=", claim.recipe)
    .where("job.state", "=", "running")
    .where("job.lease_token", "=", claim.attemptToken)
    .where("job.lease_expires_at", ">", now)
    .executeTakeFirst();
  if (job?.lease_expires_at === undefined || job.lease_expires_at === null) {
    throw OWNERSHIP_LOST;
  }
  _getAttemptTime({ options, expiry: job.lease_expires_at });
  return job.lease_expires_at;
}

async function _hasRequiredOutputs(
  options: Readonly<PublicationOptions>,
): Promise<true | undefined> {
  const item = await options.database
    .selectFrom("items")
    .select("kind")
    .where("id", "=", options.claim.itemId)
    .executeTakeFirst();
  const required =
    item?.kind === "video"
      ? ["thumb", "poster", "video_mp4"]
      : ["thumb", "display_small", "display"];
  const purposes = options.outputs.map((output) => {
    return output.rendition.purpose;
  });
  return purposes.includes("original") ||
    new Set(purposes).size !== purposes.length ||
    !required.every((purpose) => {
      return purposes.includes(purpose as ProcessedRendition["purpose"]);
    })
    ? undefined
    : true;
}

async function _getOwnedOutputs(
  options: Readonly<PublicationOptions>,
): Promise<
  Array<Selectable<Database["media_processing_outputs"]>> | undefined
> {
  if (!(await _hasRequiredOutputs(options))) {
    return undefined;
  }
  const rows = await options.database
    .selectFrom("media_processing_outputs")
    .selectAll()
    .where("job_id", "=", options.claim.jobId)
    .where("item_id", "=", options.claim.itemId)
    .where("attempt_token", "=", options.claim.attemptToken)
    .where("state", "=", "uploaded")
    .where(
      "id",
      "in",
      options.outputs.map((output) => {
        return output.outputId;
      }),
    )
    .execute();
  if (
    rows.length !== options.outputs.length ||
    !options.outputs.every((output) => {
      return rows.some((row) => {
        return (
          row.id === output.outputId && row.purpose === output.rendition.purpose
        );
      });
    })
  ) {
    return undefined;
  }
  return rows;
}

async function _enqueueRetiredKeys({
  options,
  keys,
}: {
  options: Readonly<PublicationOptions>;
  keys: readonly string[];
}): Promise<void> {
  const { database } = options;
  const now = _getAttemptTime({ options });
  await database
    .insertInto("pending_object_deletions")
    .values(
      keys.map((key) => {
        return {
          id: createId(),
          storage_key: key,
          created_at: now,
          attempts: 0,
          last_attempted_at: null,
          last_error: null,
        };
      }),
    )
    .onConflict((conflict) => {
      return conflict.column("storage_key").doNothing();
    })
    .execute();
  await database
    .updateTable("media_processing_outputs")
    .set({ state: "cleanup", updated_at: now })
    .where("storage_key", "in", keys)
    .execute();
}

async function _retireDerivatives(
  options: Readonly<PublicationOptions>,
): Promise<void> {
  const { database, claim } = options;
  const previous = await database
    .selectFrom("item_renditions")
    .select("storage_key")
    .where("item_id", "=", claim.itemId)
    .where("purpose", "!=", "original")
    .execute();
  if (previous.length > 0) {
    const keys = previous.map((row) => {
      return row.storage_key;
    });
    await _enqueueRetiredKeys({ options, keys });
  }
  await database
    .deleteFrom("item_renditions")
    .where("item_id", "=", claim.itemId)
    .where("purpose", "!=", "original")
    .execute();
}

async function _publish(
  options: Readonly<PublicationOptions>,
): Promise<boolean> {
  await _getLiveSourceExpiry(options);
  const owned = await _getOwnedOutputs(options);
  if (owned === undefined) {
    return false;
  }
  await _retireDerivatives(options);
  await options.database
    .insertInto("item_renditions")
    .values(
      options.outputs.map((output) => {
        return {
          id: createId(),
          item_id: options.claim.itemId,
          purpose: output.rendition.purpose,
          storage_key: owned.find((row) => {
            return row.id === output.outputId;
          })!.storage_key,
          content_type: output.rendition.contentType,
          byte_size: output.rendition.byteSize,
          width: output.rendition.width,
          height: output.rendition.height,
        };
      }),
    )
    .execute();
  const expiry = await _completePublication({
    options,
    outputIds: owned.map((row) => {
      return row.id;
    }),
  });
  // Check after the final awaited write, immediately before callback success.
  _getAttemptTime({ options, expiry });
  return true;
}

async function _completePublication({
  options,
  outputIds,
}: {
  options: Readonly<PublicationOptions>;
  outputIds: readonly string[];
}): Promise<string> {
  await options.database
    .updateTable("media_processing_outputs")
    .set({ state: "published", updated_at: _getAttemptTime({ options }) })
    .where("id", "in", outputIds)
    .execute();
  const expiry = await _getLiveSourceExpiry(options);
  await _completeJob({ options, expiry });
  return expiry;
}

async function _completeJob({
  options,
  expiry,
}: {
  options: Readonly<PublicationOptions>;
  expiry: string;
}): Promise<void> {
  const { database, claim } = options;
  const now = _getAttemptTime({ options, expiry });
  const result = await database
    .updateTable("media_processing_jobs")
    .set({
      state: "complete",
      lease_token: null,
      lease_expires_at: null,
      error_code: null,
      updated_at: now,
    })
    .where("id", "=", claim.jobId)
    .where("item_id", "=", claim.itemId)
    .where("source_rendition_id", "=", claim.sourceRenditionId)
    .where("recipe", "=", claim.recipe)
    .where("state", "=", "running")
    .where("lease_token", "=", claim.attemptToken)
    .where("lease_expires_at", ">", now)
    .where(
      sql<boolean>`exists (select 1 from item_renditions where id = ${claim.sourceRenditionId} and item_id = ${claim.itemId} and purpose = 'original')`,
    )
    .executeTakeFirst();
  if (result.numUpdatedRows !== 1n) {
    throw OWNERSHIP_LOST;
  }
}

/**
 * Publishes atomically only while live ownership and cancellation checks hold.
 */
export async function publishMediaRenditions(
  options: Readonly<PublicationOptions>,
): Promise<boolean> {
  try {
    return await withUploadObjectCleanupLock({
      database: options.database,
      callback: () => {
        return runMediaProcessingQueueTransition({
          database: options.database,
          callback: (database) => {
            return _publish({ ...options, database });
          },
        });
      },
    });
  } catch (error) {
    if (error === OWNERSHIP_LOST) {
      return false;
    }
    throw error;
  }
}
