import type { CaptureSource } from "@memory-shoebox/shared";
import { sql, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import {
  makeBurstsFromCandidates,
  type DetectedBurst,
} from "./makeBurstsFromCandidates.ts";
import { enqueueUploadSessionEmails } from "./enqueueUploadSessionEmails/enqueueUploadSessionEmails.ts";

/** Inputs for _writeBurst. */
type WriteBurstOptions = {
  transaction: DatabaseExecutor;
  sessionId: string;
  burst: Readonly<DetectedBurst>;
  now: string;
};

/**
 * The latch, from `data-models.md` § Exactly one email when the last file
 * lands, verbatim.
 *
 * `numUpdatedRows` is SQLite's `changes()`: 1 means this caller won.
 */
async function _latchSession(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  now: string;
}): Promise<boolean> {
  // Kysely builds the `SET` and the first three conditions; the `NOT EXISTS`
  // is the document's own text, so the two can be read side by side.

  const latched = await options.transaction
    .updateTable("upload_sessions")
    .set({ state: "settled", settled_at: options.now })
    .where("id", "=", options.sessionId)
    .where("committed_at", "is not", null)
    .where("settled_at", "is", null)
    .where(
      sql<SqlBool>`NOT EXISTS (SELECT 1 FROM upload_files
                    WHERE upload_session_id = ${options.sessionId}
                      AND state IN ('waiting','sending'))`,
    )
    .executeTakeFirst();
  return Number(latched.numUpdatedRows) === 1;
}

/**
 * Writes one burst row and points its frames at it, 1-based in capture order.
 */
async function _writeBurst(options: WriteBurstOptions): Promise<void> {
  // One `UPDATE` per burst rather than one per frame: the `CASE` gives each
  // frame its index, so 45 frames are one statement.

  const { burst } = options;
  const burstId = createId();
  await options.transaction
    .insertInto("bursts")
    .values({
      id: burstId,
      upload_session_id: options.sessionId,
      captured_on: burst.capturedOn,
      starts_at: burst.startsAt,
      ends_at: burst.endsAt,
      detector_version: appConfig.burst.detectorVersion,
      threshold_seconds: appConfig.burst.maxGapSeconds,
      detected_at: options.now,
      is_manual: 0,
      cover_item_id: null,
    })
    .execute();

  const indexCases = burst.itemIds.map((itemId, index) => {
    return sql`WHEN ${itemId} THEN ${index + 1}`;
  });
  await options.transaction
    .updateTable("items")
    .set({
      burst_id: burstId,
      burst_index: sql<number>`CASE id ${sql.join(indexCases, sql` `)} END`,
    })
    .where("id", "in", [...burst.itemIds])
    .execute();
}

/**
 * Burst detection, once, over the items this session produced
 * (`apis/upload.md` § Burst detection, once, at settle).
 *
 * Before the email, so the `done` state's "45 frames collapsed into one
 * stack" is true by the time anybody reads it. No `frame_count` is written,
 * ever: a stored count would leak restricted frames through a denominator.
 */
async function _writeBursts(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  now: string;
}): Promise<void> {
  const candidates = await options.transaction
    .selectFrom("items")
    .select([
      "id as itemId",
      "captured_on as capturedOn",
      "captured_at as capturedAt",
    ])
    .where("upload_session_id", "=", options.sessionId)
    .where("burst_id", "is", null)
    // Only a device's own clock can group frames: every other source (decision
    // 16: `upload_time`, `file_mtime`, `filename`, `uploader_set`) is a shared
    // declare time, a bare day, a save time or a typed day, which would stack
    // unrelated files. `captured_at` is NOT NULL, so it needs no filter.
    .where("capture_source", "in", [
      "exif",
      "video_metadata",
    ] as const satisfies readonly CaptureSource[])
    .execute();

  const bursts = makeBurstsFromCandidates({
    candidates,
    maxGapSeconds: appConfig.burst.maxGapSeconds,
    minimumFrameCount: appConfig.burst.minimumFrameCount,
  });
  await Promise.all(
    bursts.map((burst) => {
      return _writeBurst({ ...options, burst });
    }),
  );
}

/**
 * Settles a batch if, and only if, this caller is the one that finishes it.
 *
 * Runs the latch `UPDATE`. When it changes one row, and only then, it runs
 * burst detection, enqueues one `upload_session` email per recipient, and
 * records `notified_member_count` and `notified_at` ,
 * decision 4), all in the caller's transaction. SQLite serialises writers,
 * so two callers racing for the last file cannot both win.
 *
 * Called after every terminal file transition (`complete` on both outcomes),
 * once by `commit` in case the manifest is already terminal, and by
 * `upload-abandon-sweep` once per session it touched. A retry after settling
 * flips a file back to `waiting`, and the latch refuses it because
 * `settled_at` is set, so the recovered photograph appears silently.
 *
 * **It never calls Backblaze**, and the caller must not either while the
 * transaction is open.
 *
 * @param options.transaction The caller's `BEGIN IMMEDIATE` transaction.
 * @param options.sessionId The batch whose file just went terminal.
 * @param options.now The transition time, which becomes `settled_at`.
 * @returns Whether this call settled the batch.
 */
export async function settleUploadSession(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
    now: string;
  }>,
): Promise<{ didSettle: boolean }> {
  const didLatch = await _latchSession(options);
  if (!didLatch) {
    return { didSettle: false };
  }

  const session = await options.transaction
    .selectFrom("upload_sessions")
    .select("uploaded_by")
    .where("id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  await _writeBursts(options);
  const { recipientCount } = await enqueueUploadSessionEmails({
    transaction: options.transaction,
    sessionId: options.sessionId,
    uploadedBy: session.uploaded_by,
    now: options.now,
  });
  await options.transaction
    .updateTable("upload_sessions")
    .set({ notified_member_count: recipientCount, notified_at: options.now })
    .where("id", "=", options.sessionId)
    .execute();

  return { didSettle: true };
}
