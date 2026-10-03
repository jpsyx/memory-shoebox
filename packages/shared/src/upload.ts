import { z } from "zod";
import { cursorSchema } from "./collectionSchema.ts";
import {
  calendarDateSchema,
  idSchema,
  mediaRefSchema,
  memberRefSchema,
  milestoneRefSchema,
  personRefSchema,
  signedUrlSchema,
  tagRefSchema,
  timestampSchema,
  visibilitySummarySchema,
} from "./dtos.ts";
import { resolveVisibilityRuleRequestSchema } from "./itemEdits.ts";
import { CAPTURE_SOURCES } from "./items.ts";
import { LIMITS, UPLOAD_LIMITS } from "./limits.ts";
import { ianaTimezoneSchema } from "./settings.ts";

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
const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/u, {
  message: "A content hash is 64 lowercase hex characters.",
});

/** A byte count. Zero is a real file, refused later as `empty_file`. */
const byteCountSchema = z.number().int().nonnegative();

/** A count over the session's own rows. */
const countSchema = z.number().int().nonnegative();

/** Post-orientation pixels, when known. */
const dimensionSchema = z.number().int().positive();

/** The batch, as every upload route that returns one describes it. */
export const uploadSessionSummarySchema = z.object({
  sessionId: idSchema,
  state: uploadSessionStateSchema,
  uploadedBy: memberRefSchema,
  visibility: visibilitySummarySchema,
  /** Diagnostic only. Capture dates resolve in `shoebox.timezone`. */
  clientTimezone: z.string(),
  /** Snapshotted at commit; 0 on a draft with no manifest yet. */
  fileCount: countSchema,
  /** Excludes refused rows. A number, never "5.2 GB": the browser formats. */
  totalBytes: byteCountSchema,
  createdAt: timestampSchema,
  committedAt: timestampSchema.nullable(),
  settledAt: timestampSchema.nullable(),
  lastActivityAt: timestampSchema,
  /** Written by the mail fan-out; null until then. */
  notifiedAt: timestampSchema.nullable(),
  notifiedMemberCount: countSchema.nullable(),
});

/** The batch, as every upload route that returns one describes it. */
export type UploadSessionSummary = z.infer<typeof uploadSessionSummarySchema>;

/**
 * Every figure here is a `GROUP BY` over a few hundred rows. None is a
 * column.
 */
export const uploadProgressSchema = z.object({
  waitingCount: countSchema,
  sendingCount: countSchema,
  doneCount: countSchema,
  failedCount: countSchema,
  refusedCount: countSchema,
  cancelledCount: countSchema,
  /** Sum of declared bytes over done files. Whole files only. */
  doneBytes: byteCountSchema,
});

/** Every figure here is a `GROUP BY` over a few hundred rows. */
export type UploadProgress = z.infer<typeof uploadProgressSchema>;

/** One manifest row, as the surface draws it. */
export const uploadFileDtoSchema = z.object({
  fileId: idSchema,
  position: z.number().int().nonnegative(),
  originalFilename: z.string(),
  declaredContentType: z.string(),
  declaredBytes: byteCountSchema,
  contentHash: contentHashSchema.nullable(),
  state: uploadFileStateSchema,
  attemptCount: countSchema,
  problemCode: uploadProblemCodeSchema.nullable(),
  /** English, for the admin's eye. Never the primary UI copy. */
  problemDetail: z.string().nullable(),
  capturedAt: timestampSchema.nullable(),
  capturedOn: calendarDateSchema.nullable(),
  captureOffsetMinutes: z.number().int().nullable(),
  captureSource: captureSourceSchema.nullable(),
  itemId: idSchema.nullable(),
  /** Null until ingest makes the renditions. */
  media: mediaRefSchema.nullable(),
});

/** One manifest row, as the surface draws it. */
export type UploadFileDto = z.infer<typeof uploadFileDtoSchema>;

/** One day of the batch, where its files will land in the archive. */
export const uploadDayGroupSchema = z.object({
  capturedOn: calendarDateSchema,
  fileCount: countSchema,
  /** From the edit plan before ingest, from `item_milestones` after. */
  milestones: z.array(milestoneRefSchema),
});

/** One day of the batch. */
export type UploadDayGroup = z.infer<typeof uploadDayGroupSchema>;

/** One bulk action from "What you have added". */
export const uploadBatchEditDtoSchema = z.object({
  editId: idSchema,
  kind: uploadEditKindSchema,
  /** The resolved name when there is a row, else `label_snapshot`. */
  label: z.string(),
  /** Null while the tag exists only as a `label_snapshot`. */
  tag: tagRefSchema.nullable(),
  person: personRefSchema.nullable(),
  milestone: milestoneRefSchema.nullable(),
  /** The "on 12 of 264" figure. */
  targetCount: countSchema,
  createdAt: timestampSchema,
  undoneAt: timestampSchema.nullable(),
  appliedAt: timestampSchema.nullable(),
  canUndo: z.boolean(),
});

/** One bulk action from "What you have added". */
export type UploadBatchEditDto = z.infer<typeof uploadBatchEditDtoSchema>;

/** A file named with the day it will land on, for the two groups below. */
const datedFileRefSchema = z.object({
  fileId: idSchema,
  originalFilename: z.string(),
  capturedOn: calendarDateSchema,
});

/** The `milestone-fix` state: attached, but captured outside the span. */
export const uploadMismatchGroupSchema = z.object({
  milestone: milestoneRefSchema,
  files: z.array(datedFileRefSchema),
});

/** The `milestone-fix` state: attached, but captured outside the span. */
export type UploadMismatchGroup = z.infer<typeof uploadMismatchGroupSchema>;

/**
 * "These did not say when they were taken": the files that reached rung 4
 * or rung 6 of the ladder (design decision 9).
 */
export const uploadUndatedGroupSchema = z.object({
  fileCount: countSchema,
  /** The rung the server fell back to for every one of them. */
  captureSource: captureSourceSchema,
  files: z.array(datedFileRefSchema),
});

/** "These did not say when they were taken." */
export type UploadUndatedGroup = z.infer<typeof uploadUndatedGroupSchema>;

/** A file still to come, for resume's "these 64 are still to come". */
export const pendingFileRefSchema = z.object({
  fileId: idSchema,
  originalFilename: z.string(),
  declaredBytes: byteCountSchema,
});

/** A file still to come. */
export type PendingFileRef = z.infer<typeof pendingFileRefSchema>;

/**
 * The whole of the `done` state. Nothing here is stored except
 * `notifiedMemberCount`.
 */
export const uploadOutcomeSummarySchema = z.object({
  itemCount: countSchema,
  dayCount: countSchema,
  milestoneCount: countSchema,
  burstCount: countSchema,
  burstFrameCount: countSchema,
  notifiedMemberCount: countSchema.nullable(),
});

/** The whole of the `done` state. */
export type UploadOutcomeSummary = z.infer<typeof uploadOutcomeSummarySchema>;

/**
 * `GET /api/upload-sessions/:sessionId`, `GET .../current` and
 * `POST .../commit`: the batch, its plan, and one page of its files.
 */
export const uploadSessionDetailSchema = uploadSessionSummarySchema.extend({
  progress: uploadProgressSchema,
  days: z.array(uploadDayGroupSchema),
  edits: z.array(uploadBatchEditDtoSchema),
  mismatches: z.array(uploadMismatchGroupSchema),
  undated: uploadUndatedGroupSchema.nullable(),
  /** Resume: what is still to come. First 100; page `files` for the rest. */
  pendingFiles: z.array(pendingFileRefSchema),
  /** Non-null once settled. */
  summary: uploadOutcomeSummarySchema.nullable(),
  files: z.array(uploadFileDtoSchema),
  /** Encodes `upload_files.position`. Null means the end. */
  nextCursor: cursorSchema.nullable(),
});

/** The batch, its plan, and one page of its files. */
export type UploadSessionDetail = z.infer<typeof uploadSessionDetailSchema>;

/**
 * What the browser read from a file's headers. Evidence, never the verdict:
 * the server picks the rung and records `capture_source`.
 *
 * **Lenient on purpose.** A camera with an unset clock writes
 * `0000:00:00 00:00:00`, and a value the ladder cannot read falls to the next
 * rung rather than refusing a 500-entry manifest over one file's header. The
 * strings are bounded and otherwise left for the ladder to judge.
 */
export const manifestCaptureEvidenceSchema = z.object({
  /**
   * EXIF `DateTimeOriginal` as the file carried it, with no zone applied:
   * `2026-09-14T06:41:32`. EXIF's own `2026:09:14 06:41:32` is read too.
   */
  exifCapturedAtLocal: z.string().max(64).nullish(),
  /** EXIF `OffsetTimeOriginal`, in minutes. */
  exifOffsetMinutes: z.number().int().nullish(),
  /** QuickTime/MP4 `creation_time`, UTC by specification. */
  videoCreationTime: z.string().max(64).nullish(),
  /** The File API's `lastModified`, as an ISO-8601 UTC timestamp. */
  lastModifiedAt: z.string().max(64).nullish(),
});

/** What the browser read from a file's headers. */
export type ManifestCaptureEvidence = z.infer<
  typeof manifestCaptureEvidenceSchema
>;

/**
 * One picked file, declared before a byte moves.
 *
 * **`width`, `height` and `durationMs` are strict** (positive integers, and a
 * non-negative integer for the duration), unlike the capture evidence: send
 * `null` for a value the browser could not read and round a fractional
 * duration, because one bad value refuses the whole request.
 */
export const manifestEntrySchema = z.object({
  /** The browser's own handle for this `File`, echoed back to pair it. */
  clientRef: z.string().min(1).max(200),
  /** Present when amending a row that already exists (`milestone-fix`). */
  fileId: idSchema.nullish(),
  originalFilename: z.string().min(1).max(1024),
  /**
   * `File.type`, or the extension's type where the browser reports none. An
   * empty string is accepted and refused as `unsupported_type`, a row in the
   * response rather than a failed request.
   */
  declaredContentType: z.string().max(255),
  declaredBytes: byteCountSchema,
  /** Optional here, required at presign. */
  contentHash: contentHashSchema.nullish(),
  capture: manifestCaptureEvidenceSchema.optional(),
  /**
   * An amendment: the uploader saying so, rung 5. **Only its calendar date
   * is read, exactly as written** (the first ten characters), and the file's
   * own clock time is kept, so send the picked day as written
   * (`2026-09-15T00:00:00.000Z` for the 15th), never a local midnight
   * converted to UTC, which is the day before east of Greenwich.
   */
  capturedAt: z.iso.datetime({ offset: true }).nullish(),
  /** Post-orientation, when the browser can read them cheaply. */
  width: dimensionSchema.nullish(),
  height: dimensionSchema.nullish(),
  durationMs: z.number().int().nonnegative().nullish(),
});

/** One picked file, declared before a byte moves. */
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

/** What happened to one manifest entry. */
export const manifestOutcomeSchema = z.object({
  clientRef: z.string(),
  fileId: idSchema,
  disposition: z.enum([
    "created",
    "matched",
    "amended",
    "already_done",
    "refused",
  ]),
  state: uploadFileStateSchema,
  capturedOn: calendarDateSchema.nullable(),
  captureSource: captureSourceSchema.nullable(),
  problemCode: uploadProblemCodeSchema.nullable(),
});

/** What happened to one manifest entry. */
export type ManifestOutcome = z.infer<typeof manifestOutcomeSchema>;

/** One derivative the client produced and transferred with the original. */
export const uploadedRenditionSchema = z.object({
  purpose: renditionPurposeSchema,
  byteSize: z.number().int().positive(),
  /** Post-orientation, like the parent's. */
  width: dimensionSchema.nullable(),
  height: dimensionSchema.nullable(),
});

/** One derivative the client produced and transferred with the original. */
export type UploadedRendition = z.infer<typeof uploadedRenditionSchema>;

/** The headers a presigned PUT must carry, `Content-Type` included. */
const presignHeadersSchema = z.record(z.string(), z.string());

/** One URL, one PUT. */
export const presignSingleSchema = z.object({
  mode: z.literal("single"),
  fileId: idSchema,
  method: z.literal("PUT"),
  url: signedUrlSchema,
  /** Exactly what the browser must send, `Content-Type` included. */
  headers: presignHeadersSchema,
  expiresAt: timestampSchema,
});

/** One URL, one PUT. */
export type PresignSingle = z.infer<typeof presignSingleSchema>;

/** One signed part of a multipart upload. */
const presignedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  url: signedUrlSchema,
  expiresAt: timestampSchema,
});

/** A multipart upload, and the part URLs asked for. */
export const presignMultipartSchema = z.object({
  mode: z.literal("multipart"),
  fileId: idSchema,
  multipartUploadId: z.string().min(1),
  partSizeBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  parts: z.array(presignedPartSchema),
  method: z.literal("PUT"),
  headers: presignHeadersSchema,
  /** The earliest of the parts, so the client has one number to watch. */
  expiresAt: timestampSchema,
});

/** A multipart upload, and the part URLs asked for. */
export type PresignMultipart = z.infer<typeof presignMultipartSchema>;

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

/** `POST .../files/:fileId/presign`. */
export const presignUploadFileRequestSchema = z.object({
  /** Required here even when the manifest omitted it. */
  contentHash: contentHashSchema,
  /** Must equal the row's `declared_bytes`. */
  byteSize: byteCountSchema,
  purpose: renditionPurposeSchema.default("original"),
  /** Multipart only: the parts still wanted. Omitted means all of them. */
  partNumbers: z.array(z.number().int().positive()).min(1).optional(),
});

/** `POST .../files/:fileId/presign`. */
export type PresignUploadFileRequest = z.infer<
  typeof presignUploadFileRequestSchema
>;

/** Single or multipart, told apart by `mode`. */
export const presignUploadFileResponseSchema = z.discriminatedUnion("mode", [
  presignSingleSchema,
  presignMultipartSchema,
]);

/** Single or multipart, told apart by `mode`. */
export type PresignUploadFileResponse = z.infer<
  typeof presignUploadFileResponseSchema
>;

/** One multipart part, as the browser finished it. */
const completedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
});

/**
 * `POST .../files/:fileId/complete`: the transfer is over either way.
 *
 * `outcome: "done"` needs a `contentHash` to compare with what was
 * presigned. Whether a file also needs `parts` depends on how it was
 * presigned, which only the route knows.
 */
export const completeUploadFileRequestSchema = z
  .object({
    outcome: z.enum(["done", "failed"]),
    /** `done` only. Must match the row. */
    contentHash: contentHashSchema.optional(),
    byteSize: byteCountSchema.optional(),
    /** `done` and multipart only, in part order. */
    parts: z.array(completedPartSchema).optional(),
    /** `done` only, post-orientation. */
    width: dimensionSchema.nullish(),
    height: dimensionSchema.nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
    /** `done` only: every derivative that landed. */
    renditions: z.array(uploadedRenditionSchema).optional(),
    /** `failed` only. */
    problemCode: uploadProblemCodeSchema.nullish(),
    problemDetail: z.string().max(LIMITS.freeTextMaxLength).nullish(),
  })
  .refine(
    (body) => {
      return body.outcome === "failed" || body.contentHash !== undefined;
    },
    { message: "A finished transfer names its hash.", path: ["contentHash"] },
  );

/** `POST .../files/:fileId/complete`. */
export type CompleteUploadFileRequest = z.infer<
  typeof completeUploadFileRequestSchema
>;

/** The file, and enough of the batch to move the bar without a `GET`. */
export const completeUploadFileResponseSchema = z.object({
  file: uploadFileDtoSchema,
  /** So 264 completes do not become 264 completes plus 264 GETs. */
  progress: uploadProgressSchema,
  sessionState: uploadSessionStateSchema,
  /** True only for the one caller whose latch reported `changes() = 1`. */
  didSettle: z.boolean(),
});

/** The file, and enough of the batch to move the bar without a `GET`. */
export type CompleteUploadFileResponse = z.infer<
  typeof completeUploadFileResponseSchema
>;

/** `POST .../files/:fileId/retry`. */
export const retryUploadFileResponseSchema = z.object({
  file: uploadFileDtoSchema,
  /**
   * False once the batch has settled: the latch will not fire twice, so the
   * recovered photograph appears silently and the surface must not promise
   * mail.
   */
  isIncludedInEmail: z.boolean(),
});

/** `POST .../files/:fileId/retry`. */
export type RetryUploadFileResponse = z.infer<
  typeof retryUploadFileResponseSchema
>;

/**
 * The write shape for one subject of a visibility rule: the element of
 * `resolveVisibilityRuleRequestSchema.subjects`, taken from it rather than
 * restated, so the item slice's rule resolver and this slice's batch rule
 * cannot drift apart.
 */
export const visibilitySubjectInputSchema =
  resolveVisibilityRuleRequestSchema.shape.subjects.unwrap().element;

/** The write shape for one subject of a visibility rule. */
export type VisibilitySubjectInput = z.infer<
  typeof visibilitySubjectInputSchema
>;

/**
 * `PATCH /api/upload-sessions/:sessionId/visibility`: one rule for the
 * whole batch. The body is `resolveVisibilityRuleRequestSchema`'s (mode plus
 * subjects, the list defaulting to empty), with the one refinement this
 * route adds: `everyone` takes no subjects; `only` and `except` take at
 * least one, because the control's "Nobody yet" state is pre-submit.
 */
export const setUploadVisibilityRequestSchema =
  resolveVisibilityRuleRequestSchema.refine(
    (body) => {
      return (body.mode === "everyone") === (body.subjects.length === 0);
    },
    {
      message: "Everyone takes no subjects; only and except take some.",
      path: ["subjects"],
    },
  );

/** `PATCH /api/upload-sessions/:sessionId/visibility`. */
export type SetUploadVisibilityRequest = z.infer<
  typeof setUploadVisibilityRequestSchema
>;

/** The body of `POST .../edits`, before the per-kind rule is checked. */
const createUploadEditBodySchema = z.object({
  kind: uploadEditKindSchema,
  /** Every id must belong to this session. */
  targetFileIds: z
    .array(idSchema)
    .min(1)
    .max(UPLOAD_LIMITS.editTargetsPerRequest),
  /** An existing tag chosen from the picker. */
  tagId: idSchema.nullish(),
  /** An existing person chosen from the picker. */
  personId: idSchema.nullish(),
  /** Required for kind `milestone`, from `POST /api/milestones`. */
  milestoneId: idSchema.nullish(),
  /**
   * The name as typed, for a tag or a person the archive has never heard
   * of. Carried until ingest; never accepted for a milestone.
   */
  labelSnapshot: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.freeTextMaxLength)
    .nullish(),
});

/** Whether an optional reference field was sent with a value. */
function _isPresent(value: string | null | undefined): boolean {
  return value !== undefined && value !== null;
}

/**
 * The per-kind rule: a tag names exactly one of `tagId` / `labelSnapshot`,
 * a person exactly one of `personId` / `labelSnapshot`, and a milestone a
 * `milestoneId` and nothing else. A reference to another kind is refused
 * too, so a stray `personId` on a tag edit cannot sit there unread.
 */
function _isCoherentUploadEdit(
  body: Readonly<z.infer<typeof createUploadEditBodySchema>>,
): boolean {
  const hasTag = _isPresent(body.tagId);
  const hasPerson = _isPresent(body.personId);
  const hasMilestone = _isPresent(body.milestoneId);
  const hasLabel = _isPresent(body.labelSnapshot);

  switch (body.kind) {
    case "tag":
      return hasTag !== hasLabel && !hasPerson && !hasMilestone;
    case "person":
      return hasPerson !== hasLabel && !hasTag && !hasMilestone;
    case "milestone":
      return hasMilestone && !hasLabel && !hasTag && !hasPerson;
  }
}

/**
 * `POST /api/upload-sessions/:sessionId/edits`: one bulk action.
 *
 * A new tag's `labelSnapshot` is capped as a tag name is everywhere else; a
 * new person's is not, because `people.display_name` is uncapped by design
 * (`conventions.md` § String lengths names the member column only).
 */
export const createUploadEditRequestSchema = createUploadEditBodySchema
  .refine(_isCoherentUploadEdit, {
    message:
      "A tag or a person names an id or a label, and a milestone names an id.",
    path: ["kind"],
  })
  .refine(
    (body) => {
      return (
        body.kind !== "tag" ||
        (body.labelSnapshot ?? "").length <= LIMITS.tagNameMaxLength
      );
    },
    { message: "A tag is a label, not a sentence.", path: ["labelSnapshot"] },
  );

/** `POST /api/upload-sessions/:sessionId/edits`. */
export type CreateUploadEditRequest = z.infer<
  typeof createUploadEditRequestSchema
>;

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
