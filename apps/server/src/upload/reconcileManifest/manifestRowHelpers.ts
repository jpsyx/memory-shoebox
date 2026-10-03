import {
  CAPTURE_SOURCES,
  UPLOAD_PROBLEM_CODES,
  uploadFileStateSchema,
  type ManifestEntry,
  type ManifestOutcome,
} from "@memory-shoebox/shared";

import { appConfig } from "../../../../../app.config.ts";

import { createId } from "../../db/createId.ts";

import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
} from "../captureDateLadderHelpers/captureDateLadderHelpers.ts";
import { type CaptureDateResult } from "../captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type { RefusalCode, PlanContext } from "./reconcileManifest.types.ts";

/** Why a declared file is refused, in the contract's order, or undefined. */
function _getRefusalCode(
  entry: Readonly<ManifestEntry>,
): RefusalCode | undefined {
  const accepted: readonly string[] = appConfig.upload.acceptedContentTypes;
  return accepted.includes(entry.declaredContentType.toLowerCase())
    ? entry.declaredBytes === 0
      ? "empty_file"
      : entry.declaredBytes > appConfig.upload.maxFileBytes
        ? "too_large"
        : undefined
    : "unsupported_type";
}

/** How an existing row answers an entry that names it. */
export function getDispositionFromRow(
  row: Readonly<UploadFileRow>,
): ManifestOutcome["disposition"] {
  return row.state === "done"
    ? "already_done"
    : row.state === "refused"
      ? "refused"
      : "matched";
}

/** One entry's outcome, read off the row it now names. */
export function makeManifestOutcomeFromRow(
  options: Readonly<{
    clientRef: string;
    row: Readonly<UploadFileRow>;
    disposition: ManifestOutcome["disposition"];
  }>,
): ManifestOutcome {
  const { row } = options;
  return {
    clientRef: options.clientRef,
    fileId: row.id,
    disposition: options.disposition,
    state: uploadFileStateSchema.parse(row.state),
    capturedOn: row.capture_date,
    captureSource:
      CAPTURE_SOURCES.find((source) => {
        return source === row.capture_source;
      }) ?? null,
    problemCode:
      UPLOAD_PROBLEM_CODES.find((code) => {
        return code === row.problem_code;
      }) ?? null,
  };
}

/** The ladder's result as a row holds it, for an amendment to build on. */
export function getCaptureFromRow(
  row: Readonly<UploadFileRow>,
): CaptureDateResult | undefined {
  const captureSource = CAPTURE_SOURCES.find((source) => {
    return source === row.capture_source;
  });
  if (
    row.captured_at === null ||
    row.capture_date === null ||
    captureSource === undefined
  ) {
    return undefined;
  }
  return {
    capturedAt: row.captured_at,
    captureDate: row.capture_date,
    captureOffsetMinutes: row.capture_offset_minutes ?? undefined,
    captureSource,
  };
}

/**
 * What the file said (`declared`, frozen into `original_captured_at`), and the
 * date the row carries (`current`), which is the uploader's when the entry
 * already amends it.
 */
function _getDeclaredCapture(options: {
  context: PlanContext;
  entry: Readonly<ManifestEntry>;
}): { declared: CaptureDateResult; current: CaptureDateResult } {
  const { context, entry } = options;
  // Rung 6 is the declaration time, not the commit time (design decision
  // 12): the ladder runs now and the column freezes now.
  const declared = getCaptureDateFromEvidence({
    evidence: entry.capture,
    originalFilename: entry.originalFilename,
    timezone: context.timezone,
    declaredAt: context.now,
  });
  const capturedAt = entry.capturedAt ?? undefined;
  return {
    declared,
    current:
      capturedAt === undefined
        ? declared
        : getCaptureDateFromUploaderDate({
            capturedAt,
            previous: declared,
            timezone: context.timezone,
          }),
  };
}

/** The row a new entry becomes: `waiting` with its ladder, or `refused`. */
export function makeUploadFileRowFromEntry(
  options: Readonly<{
    context: PlanContext;
    entry: Readonly<ManifestEntry>;
    position: number;
  }>,
): UploadFileRow {
  const { context, entry } = options;
  const refusal = _getRefusalCode(entry);
  // A refused file is never an item, so it gets no kind and no date: either
  // would be a fact the server does not have.
  const capture =
    refusal === undefined ? _getDeclaredCapture({ context, entry }) : undefined;
  return {
    id: createId(),
    upload_session_id: context.session.id,
    item_id: null,
    position: options.position,
    original_filename: entry.originalFilename,
    declared_content_type: entry.declaredContentType,
    declared_bytes: entry.declaredBytes,
    content_hash: entry.contentHash ?? null,
    kind:
      refusal === undefined
        ? ((contentType: string): "photo" | "video" => {
            return contentType.toLowerCase().startsWith("video/")
              ? "video"
              : "photo";
          })(entry.declaredContentType)
        : null,
    storage_key: null,
    state: refusal === undefined ? "waiting" : "refused",
    attempt_count: 0,
    presigned_until: null,
    multipart_upload_id: null,
    problem_code: refusal ?? null,
    problem_detail:
      refusal === undefined
        ? null
        : (
            {
              unsupported_type: "The Shoebox does not take files of this type.",
              empty_file: "The file is empty.",
              too_large: "The file is larger than the Shoebox takes.",
            } satisfies Record<RefusalCode, string>
          )[refusal],
    captured_at: capture?.current.capturedAt ?? null,
    capture_date: capture?.current.captureDate ?? null,
    capture_offset_minutes: capture?.current.captureOffsetMinutes ?? null,
    capture_source: capture?.current.captureSource ?? null,
    original_captured_at: capture?.declared.capturedAt ?? null,
    width: entry.width ?? null,
    height: entry.height ?? null,
    duration_ms: entry.durationMs ?? null,
    created_at: context.now,
    updated_at: context.now,
  };
}
