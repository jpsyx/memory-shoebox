import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import { createId } from "../../db/createId.ts";
import { withUploadObjectCleanupLock } from "../../upload/withUploadObjectCleanupLock.ts";
import { runMediaProcessingQueueTransition } from "../queue/runMediaProcessingQueueTransition.ts";
import type { ProcessingClaim } from "../queue/mediaProcessingQueue.types.ts";
import type { ProcessedRendition } from "../recipes/mediaRecipes.types.ts";

type ReservationOptions = {
  database: Kysely<Database>;
  claim: Readonly<ProcessingClaim>;
  renditions: readonly ProcessedRendition[];
  clock: () => Date;
  signal: AbortSignal;
};

async function _assertLiveSource(
  options: Readonly<ReservationOptions>,
): Promise<string> {
  const { database, claim } = options;
  const now = options.clock().toISOString();
  if (options.signal.aborted) {
    throw new Error("processing_output_ownership_lost");
  }
  const current = await database
    .selectFrom("media_processing_jobs")
    .select("lease_expires_at")
    .where("id", "=", claim.jobId)
    .where("item_id", "=", claim.itemId)
    .where("lease_token", "=", claim.attemptToken)
    .where("state", "=", "running")
    .where("lease_expires_at", ">", now)
    .where("source_rendition_id", "=", claim.sourceRenditionId)
    .where("recipe", "=", claim.recipe)
    .where(
      sql<boolean>`exists (select 1 from item_renditions where id = ${claim.sourceRenditionId} and item_id = ${claim.itemId} and purpose = 'original')`,
    )
    .executeTakeFirst();
  if (
    options.signal.aborted ||
    current?.lease_expires_at === undefined ||
    current.lease_expires_at === null ||
    current.lease_expires_at <= options.clock().toISOString()
  ) {
    throw new Error("processing_output_ownership_lost");
  }
  return current.lease_expires_at;
}

async function _reserve(
  options: Readonly<ReservationOptions>,
): Promise<Array<{ outputId: string; rendition: ProcessedRendition }>> {
  await _assertLiveSource(options);
  const { claim } = options;
  const now = options.clock().toISOString();
  const outputs = options.renditions.map((rendition) => {
    return { outputId: createId(), rendition };
  });
  if (
    outputs.length === 0 ||
    outputs.some(({ rendition }) => {
      return rendition.purpose === "original";
    })
  ) {
    throw new Error("processing_outputs_invalid");
  }
  await options.database
    .insertInto("media_processing_outputs")
    .values(
      outputs.map(({ outputId, rendition }) => {
        return {
          id: outputId,
          job_id: claim.jobId,
          item_id: claim.itemId,
          attempt_token: claim.attemptToken,
          storage_key: `derived/${claim.itemId}/${claim.attemptToken}/${outputId}`,
          purpose: rendition.purpose as Exclude<
            ProcessedRendition["purpose"],
            "original"
          >,
          state: "reserved" as const,
          multipart_upload_id: null,
          created_at: now,
          updated_at: now,
        };
      }),
    )
    .execute();
  const expiry = await _assertLiveSource(options);
  if (options.signal.aborted || expiry <= options.clock().toISOString()) {
    throw new Error("processing_output_ownership_lost");
  }
  return outputs;
}

/** Reserves unique attempt-owned keys before any byte can leave local scratch. */
export async function reserveMediaOutputs(
  options: Readonly<ReservationOptions>,
): Promise<Array<{ outputId: string; rendition: ProcessedRendition }>> {
  return withUploadObjectCleanupLock({
    database: options.database,
    callback: () => {
      return runMediaProcessingQueueTransition({
        database: options.database,
        callback: (database) => {
          return _reserve({ ...options, database });
        },
      });
    },
  });
}
