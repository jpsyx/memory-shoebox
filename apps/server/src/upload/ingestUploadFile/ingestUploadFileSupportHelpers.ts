import { sql } from "kysely";

import { createId } from "../../db/createId.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type {
  GetIngestCaptureResult,
  InsertItemOptions,
  IngestRendition,
} from "./ingestUploadFile.types.ts";

/**
 * What the manifest decided and froze on a file row, as ingest needs it.
 * Every row the manifest accepted got all of it, so a missing value here is a
 * broken invariant, not a user error, and throws rather than guessing: a null
 * `kind` is never quietly a photograph, and a null `original_captured_at` is
 * never quietly the possibly amended `captured_at` (`upload.md` Ruling 3).
 */
function _getIngestCapture(
  file: Readonly<UploadFileRow>,
): GetIngestCaptureResult {
  if (
    (file.kind !== "photo" && file.kind !== "video") ||
    file.captured_at === null ||
    file.capture_date === null ||
    file.capture_source === null ||
    file.original_captured_at === null
  ) {
    throw new Error(
      `upload file ${file.id} reached ingest without its kind or capture date`,
    );
  }
  return {
    kind: file.kind,
    capturedAt: file.captured_at,
    captureDate: file.capture_date,
    captureSource: file.capture_source,
    originalCapturedAt: file.original_captured_at,
  };
}

/**
 * Inserts the uploaded item's catalog row and returns its id.
 */
export async function insertItem(
  options: Readonly<InsertItemOptions>,
): Promise<string> {
  const { file, session } = options;
  const capture = _getIngestCapture(file);
  const itemId = createId();
  await options.transaction
    .insertInto("items")
    .values({
      id: itemId,
      // Decided at the manifest from the declared type, which presign then
      // signed into the PUT, so Backblaze cannot hold any other.
      kind: capture.kind,
      captured_at: capture.capturedAt,
      captured_at_offset_minutes: file.capture_offset_minutes,
      captured_on: capture.captureDate,
      capture_source: capture.captureSource,
      original_captured_at: capture.originalCapturedAt,
      // MAX + 1 on `UNIQUE (seq)` is one index lookup, and the caller's
      // `BEGIN IMMEDIATE` means no second writer can take the same number.
      seq: sql<number>`(SELECT COALESCE(MAX(seq), 0) + 1 FROM items)`,
      uploaded_by: session.uploaded_by,
      upload_session_id: session.id,
      // Copied, never referenced through the session.
      visibility_rule_id: session.visibility_rule_id,
      burst_id: null,
      burst_index: null,
      width: options.dimensions.width,
      height: options.dimensions.height,
      duration_ms: options.dimensions.durationMs ?? null,
      byte_size: file.declared_bytes,
      content_type: file.declared_content_type,
      checksum: file.content_hash,
      original_filename: file.original_filename,
      // Composed at render from the people and the date (Decision 9).
      alt_text: null,
      created_at: options.now,
    })
    .execute();
  return itemId;
}

/** One row per purpose that landed, `original` at minimum. */
export async function insertRenditions(
  options: Readonly<{
    transaction: DatabaseExecutor;
    itemId: string;
    renditions: readonly IngestRendition[];
  }>,
): Promise<void> {
  await options.transaction
    .insertInto("item_renditions")
    .values(
      options.renditions.map((rendition) => {
        return {
          id: createId(),
          item_id: options.itemId,
          purpose: rendition.purpose,
          storage_key: rendition.storageKey,
          content_type: rendition.contentType,
          byte_size: rendition.byteSize,
          width: rendition.width,
          height: rendition.height,
        };
      }),
    )
    .execute();
}
