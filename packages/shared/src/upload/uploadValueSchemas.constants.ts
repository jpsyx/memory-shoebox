import { z } from "zod";

import { CAPTURE_SOURCES } from "../items.ts";

/**
 * The upload slice's shapes: `tech-specs/apis/upload.md` § Shared types in
 * this slice.
 *
 * Every array below is in the order of the `CHECK` constraint it mirrors
 * (migration `0006_upload.ts`, or `0003_archive.ts` for the rendition
 * purposes), so the two can be read side by side, and each is an array as
 * well as a schema because the server narrows a stored column against it.
 */

/** `upload_sessions.state`. `settled` and `cancelled` are terminal. */
export const UPLOAD_SESSION_STATES = [
  "draft",
  "uploading",
  "settled",
  "cancelled",
] as const;

/** `upload_sessions.state`. `settled` and `cancelled` are terminal. */
export const uploadSessionStateSchema = z.enum(UPLOAD_SESSION_STATES);

/** `upload_sessions.state`. */
export type UploadSessionState = z.infer<typeof uploadSessionStateSchema>;

/**
 * `upload_files.state`. Everything but `waiting` and `sending` is terminal,
 * which is what lets a partial batch settle and send.
 */
export const UPLOAD_FILE_STATES = [
  "waiting",
  "sending",
  "done",
  "failed",
  "refused",
  "cancelled",
] as const;

/** `upload_files.state`. */
export const uploadFileStateSchema = z.enum(UPLOAD_FILE_STATES);

/** `upload_files.state`. */
export type UploadFileState = z.infer<typeof uploadFileStateSchema>;

/**
 * Why a file is not up. Enum values in a payload, never HTTP error codes:
 * a refused PDF is a row in a `200`, not a failed request.
 */
export const UPLOAD_PROBLEM_CODES = [
  "unsupported_type",
  "too_large",
  "empty_file",
  "connection_lost",
  "checksum_mismatch",
  "content_mismatch",
  "storage_rejected",
  "abandoned",
  "cancelled_by_uploader",
] as const;

/** Why a file is not up. */
export const uploadProblemCodeSchema = z.enum(UPLOAD_PROBLEM_CODES);

/** Why a file is not up. */
export type UploadProblemCode = z.infer<typeof uploadProblemCodeSchema>;

/**
 * `item_renditions.purpose`. `video_webm` and `video_mp4` are accepted and
 * never produced: v1 transcodes no video (`upload.md` Ruling 1).
 */
export const RENDITION_PURPOSES = [
  "original",
  "display",
  "thumb",
  "poster",
  "video_webm",
  "video_mp4",
] as const;

/** `item_renditions.purpose`. */
export const renditionPurposeSchema = z.enum(RENDITION_PURPOSES);

/** `item_renditions.purpose`. */
export type RenditionPurpose = z.infer<typeof renditionPurposeSchema>;

/**
 * How a capture date was arrived at, over the existing `CAPTURE_SOURCES`
 * rather than a second copy of the six strings.
 */
export const captureSourceSchema = z.enum(CAPTURE_SOURCES);

/** How a capture date was arrived at. */
export type CaptureSource = z.infer<typeof captureSourceSchema>;

/** `upload_batch_edits.kind`, in the order of its `CHECK`. */
export const UPLOAD_EDIT_KINDS = ["tag", "person", "milestone"] as const;

/** `upload_batch_edits.kind`. */
export const uploadEditKindSchema = z.enum(UPLOAD_EDIT_KINDS);

/** `upload_batch_edits.kind`. */
export type UploadEditKind = z.infer<typeof uploadEditKindSchema>;

/** Lowercase hex SHA-256 of a file's bytes, computed in the browser. */
export const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/u, {
  message: "A content hash is 64 lowercase hex characters.",
});

/** A byte count. Zero is a real file, refused later as `empty_file`. */
export const byteCountSchema = z.number().int().nonnegative();

/** A count over the session's own rows. */
export const countSchema = z.number().int().nonnegative();

/** Post-orientation pixels, when known. */
export const dimensionSchema = z.number().int().positive();

/**
 * Every refusal this slice makes, appended to the registry in
 * `conventions.md` § Error code registry. The comment on each is its status.
 */
export const UPLOAD_ERROR_CODES = [
  "upload_forbidden", // 403, role only
  "upload_session_not_found", // 404, and never 403
  "upload_session_conflict", // 409
  "upload_session_empty", // 400
  "upload_file_not_found", // 404
  "upload_file_conflict", // 409
  "upload_manifest_conflict", // 409
  "upload_edit_not_found", // 404
  "upload_edit_conflict", // 409
  "upload_storage_unavailable", // 503
] as const;

/** Every refusal this slice makes. */
export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];
