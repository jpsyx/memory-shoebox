import { z } from "zod";

import { cursorSchema } from "../collectionSchema.ts";

import { idSchema } from "../dtos.ts";

import { UPLOAD_LIMITS } from "../limits.ts";

import { ianaTimezoneSchema } from "../settings.ts";

import {
  uploadFileStateSchema,
  countSchema,
  byteCountSchema,
} from "./uploadValueSchemas.constants.ts";

import {
  manifestEntrySchema,
  manifestOutcomeSchema,
} from "./uploadManifestSchemas.constants.ts";

/** The path every session route takes. */
export const uploadSessionParamsSchema = z.object({ sessionId: idSchema });

/** The path every session route takes. */
export type UploadSessionParams = z.infer<typeof uploadSessionParamsSchema>;

/** The path every file route takes. */
export const uploadFileParamsSchema = z.object({
  sessionId: idSchema,
  fileId: idSchema,
});

/** The path every file route takes. */
export type UploadFileParams = z.infer<typeof uploadFileParamsSchema>;

/** The path the undo route takes. */
export const uploadEditParamsSchema = z.object({
  sessionId: idSchema,
  editId: idSchema,
});

/** The path the undo route takes. */
export type UploadEditParams = z.infer<typeof uploadEditParamsSchema>;

/** `POST /api/upload-sessions`. */
export const openUploadSessionRequestSchema = z.object({
  /**
   * The browser's IANA zone. Recorded on `upload_sessions.client_timezone`
   * for diagnosis only: capture dates resolve in `shoebox.timezone`.
   */
  clientTimezone: ianaTimezoneSchema,
});

/** `POST /api/upload-sessions`. */
export type OpenUploadSessionRequest = z.infer<
  typeof openUploadSessionRequestSchema
>;

/**
 * `POST /api/upload-sessions/:sessionId/commit`: what the caller means.
 *
 * The route used to read the meaning off the session's state, so a double
 * click on "Put N up", or a retry of a commit whose response was lost, found
 * an `uploading` batch and closed it, cancelling every file. The caller says
 * which it means instead, and a repeat of what already happened is then a
 * no-op rather than the other action:
 *
 * - `arm`: "Put N up", on a `draft`. On a batch already `uploading` or
 *   `settled` it is an idempotent `200` that writes nothing.
 * - `close`: "Send what did arrive", on an `uploading` batch. On a `settled`
 *   one it is an idempotent `200` that writes nothing; on a `draft` it is a
 *   `409`, because a batch never armed has nothing in flight to close.
 *
 * A `cancelled` session is a `409` for both. The body is required.
 */
export const commitUploadSessionRequestSchema = z.object({
  intent: z.enum(["arm", "close"]),
});

/** `POST /api/upload-sessions/:sessionId/commit`. */
export type CommitUploadSessionRequest = z.infer<
  typeof commitUploadSessionRequestSchema
>;

/**
 * `?states=failed,refused`: comma-separated, so the `partial` state fetches
 * its casualties without paging 264 rows. Empty entries are dropped and an
 * empty list means every state; an unknown state is a `400`.
 */
const statesQuerySchema = z
  .string()
  .optional()
  .transform((value) => {
    const states = [
      ...new Set(
        (value ?? "")
          .split(",")
          .map((entry) => {
            return entry.trim();
          })
          .filter((entry) => {
            return entry !== "";
          }),
      ),
    ];
    return states.length === 0 ? null : states;
  })
  .pipe(z.array(uploadFileStateSchema).nullable());

/** `GET /api/upload-sessions/:sessionId`'s query string. */
export const uploadSessionDetailQuerySchema = z.object({
  // `z.coerce`: a query string is always a string.
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(UPLOAD_LIMITS.detailPageMax)
    .default(UPLOAD_LIMITS.detailPageDefault),
  /** Opaque; encodes `upload_files.position`, not the uuidv7 id. */
  cursor: cursorSchema.optional(),
  states: statesQuerySchema,
});

/** `GET /api/upload-sessions/:sessionId`'s query string. */
export type UploadSessionDetailQuery = z.infer<
  typeof uploadSessionDetailQuerySchema
>;

/** `PATCH /api/upload-sessions/:sessionId/manifest`. Additive, never a PUT. */
export const putUploadManifestRequestSchema = z.object({
  files: z
    .array(manifestEntrySchema)
    .max(UPLOAD_LIMITS.manifestEntriesPerRequest),
});

/** `PATCH /api/upload-sessions/:sessionId/manifest`. */
export type PutUploadManifestRequest = z.infer<
  typeof putUploadManifestRequestSchema
>;

/** What the manifest now holds, and one outcome per entry sent. */
export const putUploadManifestResponseSchema = z.object({
  sessionId: idSchema,
  fileCount: countSchema,
  /** Excludes refused rows. */
  totalBytes: byteCountSchema,
  outcomes: z.array(manifestOutcomeSchema),
});

/** What the manifest now holds, and one outcome per entry sent. */
export type PutUploadManifestResponse = z.infer<
  typeof putUploadManifestResponseSchema
>;
