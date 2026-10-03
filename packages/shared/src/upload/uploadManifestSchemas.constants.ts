import { z } from "zod";

import { calendarDateSchema, idSchema } from "../dtos.ts";

import {
  byteCountSchema,
  contentHashSchema,
  dimensionSchema,
  uploadFileStateSchema,
  captureSourceSchema,
  uploadProblemCodeSchema,
  renditionPurposeSchema,
} from "./uploadValueSchemas.constants.ts";

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
