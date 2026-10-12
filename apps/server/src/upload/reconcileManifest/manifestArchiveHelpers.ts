import type { ManifestEntry } from "@memory-shoebox/shared";
import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";
import type {
  ManifestPlan,
  PlanContext,
  WritePlanOptions,
} from "./reconcileManifest.types.ts";
import { sql } from "kysely";
import { getDuplicateReasonFromEntry } from "./manifestVisualHelpers.ts";

/** Duplicate feedback without revealing the existing item. */
export const ARCHIVE_DUPLICATE_DETAIL =
  "Duplicate, already in the shoebox. This file will be skipped.";

function _makeCheckedRowFromEntry(
  options: Readonly<{
    context: PlanContext;
    entry: ManifestEntry;
    row: UploadFileRow;
  }>,
): UploadFileRow {
  const { context, entry, row } = options;
  const hash = entry.contentHash ?? row.content_hash;
  const reason = getDuplicateReasonFromEntry({
    context,
    entry,
    excludeFileId: row.id,
  });
  const holder = hash ? context.candidates.rowsByHash.get(hash) : undefined;
  return {
    ...row,
    state: reason ? "cancelled" : row.state,
    duplicate_reason: reason ?? null,
    problem_code: null,
    problem_detail:
      reason === "archive"
        ? ARCHIVE_DUPLICATE_DETAIL
        : reason === "batch"
          ? "Duplicate, already selected. This file will be skipped."
          : row.problem_detail,
    // Only one row per session may hold a hash, including terminal rows.
    content_hash: !holder || holder.id === row.id ? hash : row.content_hash,
    visual_fingerprint:
      row.kind === "photo"
        ? (entry.visualFingerprint ?? row.visual_fingerprint)
        : null,
    updated_at: context.now,
  };
}

/** Saves original identity and checks waiting drafts before any transfer. */
export function getArchiveCheckedRowFromEntry(
  options: Readonly<{
    context: PlanContext;
    plan: ManifestPlan;
    entry: ManifestEntry;
    row: UploadFileRow;
  }>,
): UploadFileRow {
  const { context, plan, entry, row } = options;
  if (
    context.session.state !== "draft" ||
    context.session.committed_at !== null ||
    row.state !== "waiting" ||
    entry.declaredBytes !== row.declared_bytes ||
    (row.content_hash !== null &&
      entry.contentHash != null &&
      row.content_hash !== entry.contentHash) ||
    (!entry.contentHash && !entry.visualFingerprint)
  ) {
    return row;
  }
  const duplicate = _makeCheckedRowFromEntry(options);
  plan.checkedRows.set(row.id, duplicate);
  if (duplicate.content_hash !== null) {
    context.candidates.rowsByHash.set(duplicate.content_hash, duplicate);
  }
  context.candidates.rowsById.set(row.id, duplicate);
  if (duplicate.pick_id) {
    context.candidates.rowsByPickId.set(duplicate.pick_id, duplicate);
  }
  context.candidates.batchPhotos = context.candidates.batchPhotos.filter(
    (photo) => {
      return photo.id !== row.id;
    },
  );
  if (duplicate.state === "waiting" && duplicate.visual_fingerprint) {
    context.candidates.batchPhotos.push(duplicate);
  }
  return duplicate;
}

/** Saves checked draft evidence and skip verdicts in one write before transfer. */
export async function writeManifestArchiveDuplicates(
  options: Readonly<WritePlanOptions>,
): Promise<void> {
  if (options.plan.checkedRows.size === 0) {
    return;
  }
  const rows = sql.join(
    [...options.plan.checkedRows.values()].map((row) => {
      return sql`(${row.id}, ${row.content_hash}, ${row.visual_fingerprint}, ${row.state}, ${row.duplicate_reason}, ${row.problem_detail})`;
    }),
  );
  await sql`
    WITH duplicates (id, content_hash, visual_fingerprint, state, duplicate_reason, problem_detail) AS (VALUES ${rows})
    UPDATE upload_files
       SET state = duplicates.state, duplicate_reason = duplicates.duplicate_reason, problem_code = NULL,
           problem_detail = duplicates.problem_detail, content_hash = duplicates.content_hash,
           visual_fingerprint = duplicates.visual_fingerprint,
           updated_at = ${options.now}
      FROM duplicates
     WHERE upload_files.id = duplicates.id AND upload_files.state = 'waiting'
  `.execute(options.transaction);
}
