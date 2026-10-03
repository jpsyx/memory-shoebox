import { sql } from "kysely";

import { type ManifestEntry } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { type CaptureDateResult } from "../captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

import type {
  ManifestCandidates,
  WritePlanOptions,
} from "./reconcileManifest.types.ts";

/**
 * The entries that name a file id an earlier entry already names, keyed the
 * way the request's own Zod errors are (`files.<index>.fileId`). Two entries
 * for one row would have to be merged, and a silent merge drops one of two
 * dates the uploader typed, so the request is refused instead.
 */
export function getDuplicateFileIdFieldErrorsFromEntries(
  entries: readonly ManifestEntry[],
): Record<string, string[]> {
  const seenFileIds = new Set<string>();
  return Object.fromEntries(
    entries.flatMap((entry, index) => {
      const fileId = entry.fileId ?? undefined;
      if (fileId === undefined) {
        return [];
      }
      if (!seenFileIds.has(fileId)) {
        seenFileIds.add(fileId);
        return [];
      }
      return [
        [
          `files.${index}.fileId`,
          ["Names a file that an earlier entry already names."],
        ],
      ];
    }),
  );
}

/** The values one request is probed by: its hashes, its ids, its names. */
function _getProbeValues(entries: readonly ManifestEntry[]): {
  hashes: string[];
  fileIds: string[];
  filenames: string[];
} {
  return {
    hashes: entries.flatMap((entry) => {
      const contentHash = entry.contentHash ?? undefined;
      return contentHash === undefined ? [] : [contentHash];
    }),
    fileIds: entries.flatMap((entry) => {
      const fileId = entry.fileId ?? undefined;
      return fileId === undefined ? [] : [fileId];
    }),
    filenames: entries.map((entry) => {
      return entry.originalFilename;
    }),
  };
}

/** Returns existing session rows that the manifest entries can match. */
export async function getManifestCandidatesFromEntries(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
    entries: readonly ManifestEntry[];
  }>,
): Promise<ManifestCandidates> {
  // The rows this request can match, in three batched probes: by hash on the
  // partial unique index, by id, and by name among the rows with no
  // hash that can still be named. Never one probe per entry.

  const { hashes, fileIds, filenames } = _getProbeValues(options.entries);
  const query = options.transaction
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", options.sessionId);

  const [hashed, addressed, unhashed] = await Promise.all([
    hashes.length === 0
      ? []
      : query.where("content_hash", "in", hashes).execute(),
    fileIds.length === 0 ? [] : query.where("id", "in", fileIds).execute(),
    filenames.length === 0
      ? []
      : query
          .where("content_hash", "is", null)
          .where("state", "in", [
            ...(["waiting", "sending", "refused"] as const),
          ])
          .where("original_filename", "in", filenames)
          .execute(),
  ]);

  return {
    rowsByHash: new Map(
      hashed.flatMap((row) => {
        return row.content_hash === null
          ? []
          : [[row.content_hash, row] as const];
      }),
    ),
    rowsById: new Map(
      addressed.map((row) => {
        return [row.id, row] as const;
      }),
    ),
    unhashedRows: unhashed,
  };
}

/** The next free ordinal on `UNIQUE (upload_session_id, position)`. 1-based. */
export async function getNextFilePositionFromSession(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<number> {
  const row = await options.transaction
    .selectFrom("upload_files")
    .select(sql<number | null>`MAX(position)`.as("lastPosition"))
    .where("upload_session_id", "=", options.sessionId)
    .executeTakeFirst();
  return (row?.lastPosition ?? 0) + 1;
}

/**
 * Applies capture-date amendments to waiting files while preserving
 * original_captured_at.
 *
 * The original date freezes when the ladder first runs, so reverting restores
 * the file's evidence rather than an uploader's amendment. The waiting-state
 * guard enforces the planner's eligibility at the write.
 */
async function _writeAmendments(options: {
  transaction: DatabaseExecutor;
  amendments: ReadonlyMap<string, CaptureDateResult>;
  now: string;
}): Promise<void> {
  // Every amendment in one statement.

  if (options.amendments.size === 0) {
    return;
  }
  const rows = sql.join(
    [...options.amendments].map(([fileId, capture]) => {
      return sql`(${fileId}, ${capture.capturedAt}, ${capture.captureDate}, ${capture.captureOffsetMinutes ?? null}, ${capture.captureSource})`;
    }),
  );
  await sql`
    WITH amended (id, captured_at, capture_date, capture_offset_minutes, capture_source)
      AS (VALUES ${rows})
    UPDATE upload_files
       SET captured_at = amended.captured_at,
           capture_date = amended.capture_date,
           capture_offset_minutes = amended.capture_offset_minutes,
           capture_source = amended.capture_source,
           updated_at = ${options.now}
      FROM amended
     WHERE upload_files.id = amended.id
       AND upload_files.state = 'waiting'
  `.execute(options.transaction);
}

/** The manifest's own figures: every row counted, refused bytes not summed. */
export async function getManifestTotalsFromSession(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<{ fileCount: number; totalBytes: number }> {
  const row = await options.transaction
    .selectFrom("upload_files")
    .select([
      sql<number>`COUNT(*)`.as("fileCount"),
      sql<number>`COALESCE(SUM(CASE WHEN state <> 'refused' THEN declared_bytes ELSE 0 END), 0)`.as(
        "totalBytes",
      ),
    ])
    .where("upload_session_id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  return { fileCount: row.fileCount, totalBytes: row.totalBytes };
}

/**
 * The plan's writes: one multi-row insert of the new rows, one multi-row
 * update of the amended ones, and the session's `last_activity_at`.
 */
export async function writeUploadManifestPlan(
  options: Readonly<WritePlanOptions>,
): Promise<void> {
  const { transaction, plan, now } = options;
  if (plan.insertedRows.length > 0) {
    await transaction
      .insertInto("upload_files")
      .values(plan.insertedRows)
      .execute();
  }
  await _writeAmendments({ transaction, amendments: plan.amendments, now });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", options.sessionId)
    .execute();
}
