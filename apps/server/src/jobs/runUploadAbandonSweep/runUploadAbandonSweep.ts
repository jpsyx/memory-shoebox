import { type Kysely } from "kysely";

import { appConfig } from "../../../../../app.config.ts";

import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";

import type { Database } from "../../db/types/db.types.ts";

import type { UploadAbandonSweepSummary } from "./runUploadAbandonSweep.types.ts";

import {
  abandonIdleBatches,
  abandonIdleRetriedFilesOrRecord,
  throwIfAnythingFailed,
} from "./abandonUploadCatalogHelpers.ts";

import { abortLeftoverMultipartUploads } from "./abortLeftoverMultipartUploads.ts";

/**
 * Two jobs in one, because both mean "this batch is not coming back"
 * (`conventions.md` § The job runner).
 *
 * **The committed half**, from `apis/upload.md` § `upload-abandon-sweep`: a
 * committed batch idle past `appConfig.upload.abandonGraceMinutes` has its
 * still in-flight files failed as `abandoned`, and then the settle latch runs
 * for it, in the same transaction, which is how a closed browser still tells
 * everybody about the two hundred files that did arrive. **Each batch has a
 * transaction of its own**, so one whose settle throws rolls back alone: the
 * others settle, the draft half and the aborts still run, and the failure is
 * thrown at the very end for the runner to log, the batch left as it was for
 * the next run. **The measure is the session, not the file**:
 * `last_activity_at` is bumped by presign and complete, and a single large
 * video's own row is touched only at presign, so a per-file measure would fail
 * a transfer that is going perfectly well.
 *
 * `settled_at IS NULL` rather than `state = 'uploading'`, because that is the
 * latch's own condition, so the sweep and the latch cannot drift apart.
 *
 * **A file retried after its batch settled** is the one in-flight row a settled
 * batch can hold. It is failed as `abandoned` once its own `updated_at` is past
 * the same grace, its leftovers queued in the same transaction, and the latch
 * is never run for it: the batch has already settled and sent its email.
 *
 * **What an abandoned file may have left in the bucket** (a single PUT that
 * landed, or its derivatives) is enqueued into `pending_object_deletions` in
 * that batch's transaction, for `object-deletion-drain` to delete.
 *
 * **The multipart aborts** run after that transaction commits, never inside it,
 * through `abortMultipartUploads`, and any abort that failed before, here or in
 * a route, is retried on the next run.
 *
 * **The draft half.** A pre-commit draft idle past
 * `appConfig.upload.draftExpiryHours` is cancelled. The latch cannot reach
 * these, because it requires `committed_at IS NOT NULL`, and one member may
 * have only one open session, so an abandoned draft would block them. The two
 * halves cannot touch the same row.
 *
 * @param options.database The catalog.
 * @param options.b2 Backblaze, called only outside the transaction.
 * @param options.now The run's time.
 * @returns What this run changed.
 */
export async function runUploadAbandonSweep(
  options: Readonly<{
    database: Kysely<Database>;
    b2: B2Client;
    now: string;
  }>,
): Promise<UploadAbandonSweepSummary> {
  const nowMs = Date.parse(options.now);
  const sessionsIdleBefore = new Date(
    nowMs - appConfig.upload.abandonGraceMinutes * 60_000,
  ).toISOString();
  const draftsIdleBefore = new Date(
    nowMs - appConfig.upload.draftExpiryHours * 3_600_000,
  ).toISOString();

  const committedHalf = await abandonIdleBatches({
    database: options.database,
    sessionsIdleBefore,
    now: options.now,
  });
  const failures = [...committedHalf.failures];
  const retriedFileCount = await abandonIdleRetriedFilesOrRecord({
    database: options.database,
    filesIdleBefore: sessionsIdleBefore,
    now: options.now,
    failures,
  });

  const cancelledDrafts = await options.database
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("state", "=", "draft")
    .where("committed_at", "is", null)
    .where("last_activity_at", "<=", draftsIdleBefore)
    .executeTakeFirst();

  const abortedMultipartCount = await abortLeftoverMultipartUploads(options);

  throwIfAnythingFailed(failures);
  return {
    abandonedFileCount: committedHalf.abandonedFileCount + retriedFileCount,
    cancelledDraftCount: Number(cancelledDrafts.numUpdatedRows),
    settledSessionCount: committedHalf.settledSessionCount,
    abortedMultipartCount,
  };
}
