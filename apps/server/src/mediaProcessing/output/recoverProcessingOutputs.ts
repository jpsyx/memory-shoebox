import { sql, type Kysely } from "kysely";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import { createId } from "../../db/createId.ts";
import type { Database } from "../../db/types/db.types.ts";
import { withUploadObjectCleanupLock } from "../../upload/withUploadObjectCleanupLock.ts";
import { UPLOAD_OBJECT_RECHECK_INTERVAL_MS } from "../../upload/uploadObjectCleanup.constants.ts";
import { runMediaProcessingQueueTransition } from "../queue/runMediaProcessingQueueTransition.ts";

type RecoveryOptions = {
  database: Kysely<Database>;
  b2: B2Client;
  now: string;
};
type CleanupOutput = {
  id: string;
  storage_key: string;
  multipart_upload_id: string | null;
};

async function _markCleanupRows(options: {
  database: Kysely<Database>;
  rows: readonly CleanupOutput[];
  now: string;
}): Promise<void> {
  const { database, rows } = options;
  for (const row of rows) {
    await database
      .updateTable("media_processing_outputs")
      .set({ state: "cleanup", updated_at: options.now })
      .where("id", "=", row.id)
      .execute();
    await database
      .insertInto("pending_object_deletions")
      .values({
        id: createId(),
        storage_key: row.storage_key,
        created_at: options.now,
        attempts: 0,
        last_attempted_at: null,
        last_error: null,
      })
      .onConflict((conflict) => {
        return conflict.column("storage_key").doNothing();
      })
      .execute();
  }
}

async function _claimCleanupOutputs(
  options: Readonly<RecoveryOptions>,
): Promise<CleanupOutput[]> {
  return runMediaProcessingQueueTransition({
    database: options.database,
    callback: async (database) => {
      const cutoff = new Date(
        Date.parse(options.now) - UPLOAD_OBJECT_RECHECK_INTERVAL_MS,
      ).toISOString();
      const rows = await database
        .selectFrom("media_processing_outputs as outputs")
        .leftJoin("media_processing_jobs as jobs", "jobs.id", "outputs.job_id")
        .select([
          "outputs.id",
          "outputs.storage_key",
          "outputs.multipart_upload_id",
        ])
        .where(sql<boolean>`(outputs.state = 'cleanup' and outputs.updated_at <= ${cutoff})
          or (outputs.state in ('reserved', 'uploading', 'uploaded') and (
            jobs.id is null or outputs.item_id is null or jobs.state != 'running'
            or jobs.lease_expires_at <= ${options.now} or jobs.lease_token is null
            or jobs.lease_token != outputs.attempt_token))`)
        .orderBy("outputs.updated_at")
        .orderBy("outputs.id")
        .limit(100)
        .execute();
      await _markCleanupRows({ database, rows, now: options.now });
      return rows;
    },
  });
}

async function _abortOutputUploads(
  options: Readonly<RecoveryOptions>,
  output: Readonly<CleanupOutput>,
): Promise<void> {
  // Always list, even with a persisted ID: uncertain earlier initiations also matter.
  const uploadIds = new Set<string>();
  if (output.multipart_upload_id !== null) {
    uploadIds.add(output.multipart_upload_id);
  }
  for await (const upload of options.b2.listMultipartUploadsForKey(
    output.storage_key,
  )) {
    uploadIds.add(upload.uploadId);
  }
  for (const uploadId of uploadIds) {
    try {
      await options.b2.abortMultipart({ key: output.storage_key, uploadId });
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NoSuchUpload") {
        throw error;
      }
    }
  }
}

/** Claims at most 100 abandoned outputs, preserving permanent cleanup ownership. */
export async function recoverProcessingOutputs(
  options: Readonly<RecoveryOptions>,
): Promise<void> {
  await withUploadObjectCleanupLock({
    database: options.database,
    callback: async () => {
      const outputs = await _claimCleanupOutputs(options);
      for (const output of outputs) {
        try {
          await _abortOutputUploads(options, output);
        } catch {
          // Retain this attempt's timestamp: failures recheck daily without
          // monopolizing the bounded scan ahead of later cleanup obligations.
        }
      }
    },
  });
}
