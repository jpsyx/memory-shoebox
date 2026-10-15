import type { Kysely } from "kysely";
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
  now: string;
};

async function _hasLiveSource(
  options: Readonly<PublicationOptions>,
): Promise<boolean> {
  const { database, claim, now } = options;
  const job = await database
    .selectFrom("media_processing_jobs as job")
    .innerJoin(
      "item_renditions as source",
      "source.id",
      "job.source_rendition_id",
    )
    .select("job.id")
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
  return job !== undefined;
}

async function _hasRequiredOutputs(options: Readonly<PublicationOptions>) {
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
  if (
    purposes.includes("original") ||
    new Set(purposes).size !== purposes.length ||
    !required.every((purpose) => {
      return purposes.includes(purpose as ProcessedRendition["purpose"]);
    })
  ) {
    return undefined;
  }
  return true;
}

async function _getOwnedOutputs(options: Readonly<PublicationOptions>) {
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

async function _enqueueRetiredKeys(
  options: Readonly<PublicationOptions>,
  keys: readonly string[],
): Promise<void> {
  const { database, now } = options;
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
    await _enqueueRetiredKeys(options, keys);
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
  if (!(await _hasLiveSource(options))) {
    return false;
  }
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
  await _completePublication(
    options,
    owned.map((row) => {
      return row.id;
    }),
  );
  return true;
}

async function _completePublication(
  options: Readonly<PublicationOptions>,
  outputIds: readonly string[],
): Promise<void> {
  await options.database
    .updateTable("media_processing_outputs")
    .set({ state: "published", updated_at: options.now })
    .where("id", "in", outputIds)
    .execute();
  await options.database
    .updateTable("media_processing_jobs")
    .set({
      state: "complete",
      lease_token: null,
      lease_expires_at: null,
      error_code: null,
      updated_at: options.now,
    })
    .where("id", "=", options.claim.jobId)
    .execute();
}

/** Atomically publishes a full owned set under current source, token and lease. */
export async function publishMediaRenditions(
  options: Readonly<PublicationOptions>,
): Promise<boolean> {
  return withUploadObjectCleanupLock({
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
}
