import { createReadStream } from "node:fs";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import type { ProcessingClaim } from "../queue/mediaProcessingQueue.types.ts";
import { runMediaProcessingQueueTransition } from "../queue/runMediaProcessingQueueTransition.ts";
import { withUploadObjectCleanupLock } from "../../upload/withUploadObjectCleanupLock.ts";

type UploadOptions = {
  database: Kysely<Database>;
  b2: B2Client;
  claim: Readonly<ProcessingClaim>;
  outputId: string;
  path: string;
  contentType: string;
  byteSize: number;
  signal: AbortSignal;
};

type OutputTransition = {
  options: Readonly<UploadOptions>;
  from: "reserved" | "uploading";
  to: "uploading" | "uploaded";
  uploadId?: string;
};

async function _transitionOutput(
  input: Readonly<OutputTransition>,
): Promise<string> {
  const { options, from, to, uploadId } = input;
  return withUploadObjectCleanupLock({
    database: options.database,
    callback: () => {
      return runMediaProcessingQueueTransition({
        database: options.database,
        callback: async (database) => {
          options.signal.throwIfAborted();
          const { claim } = options;
          const now = new Date().toISOString();
          const row = await database
            .updateTable("media_processing_outputs")
            .set({
              state: to,
              updated_at: now,
              ...(uploadId === undefined
                ? {}
                : { multipart_upload_id: uploadId }),
            })
            .where("id", "=", options.outputId)
            .where("state", "=", from)
            .where("job_id", "=", claim.jobId)
            .where("item_id", "=", claim.itemId)
            .where("attempt_token", "=", claim.attemptToken)
            .where(sql<boolean>`exists (select 1 from media_processing_jobs
              where id = ${claim.jobId} and item_id = ${claim.itemId}
                and source_rendition_id = ${claim.sourceRenditionId}
                and recipe = ${claim.recipe} and state = 'running'
                and lease_token = ${claim.attemptToken} and lease_expires_at > ${now})`)
            .returning("storage_key")
            .executeTakeFirst();
          if (row === undefined) {
            throw new Error("processing_output_ownership_lost");
          }
          return row.storage_key;
        },
      });
    },
  });
}

/** Uploads only a durable reservation owned by the current live database attempt. */
export async function uploadProcessingOutput(
  options: Readonly<UploadOptions>,
): Promise<void> {
  const key = await _transitionOutput({
    options,
    from: "reserved",
    to: "uploading",
  });
  const body = createReadStream(options.path, {
    highWaterMark: 64 * 1024,
    signal: options.signal,
  });
  try {
    await options.b2.putObjectStream({
      key,
      body,
      contentType: options.contentType,
      byteSize: options.byteSize,
      signal: options.signal,
      onMultipartStarted: async (uploadId) => {
        await _transitionOutput({
          options,
          from: "uploading",
          to: "uploading",
          uploadId,
        });
      },
    });
    await _transitionOutput({ options, from: "uploading", to: "uploaded" });
  } finally {
    body.destroy();
  }
}
