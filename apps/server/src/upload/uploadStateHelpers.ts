import {
  captureSourceSchema,
  uploadEditKindSchema,
  uploadFileStateSchema,
  uploadProblemCodeSchema,
  uploadSessionStateSchema,
  type CaptureSource,
  type UploadEditKind,
  type UploadFileState,
  type UploadProblemCode,
  type UploadSessionState,
} from "@memory-shoebox/shared";

/**
 * The upload tables' stored strings, narrowed to the contract's unions, and
 * the two groups of file states the readers filter by.
 *
 * Every column narrowed here carries a `CHECK` over exactly the values its
 * schema lists, so the fallbacks never run. They exist so that no reader
 * casts, and each fails in the direction that hides the least: an unknown
 * file state reads as `failed`, which neither holds the latch open nor claims
 * a photograph landed.
 */

/** The two states a file is still in flight in. The latch waits on these. */
export const IN_FLIGHT_FILE_STATES: readonly UploadFileState[] = [
  "waiting",
  "sending",
] as const;

/**
 * The two states a file never lands from: a refused PDF and a cancelled
 * file are rows in the record and nowhere in the days list. A `failed` file
 * is not here, because "Try the one that dropped" can still bring it back.
 */
export const NEVER_LANDING_FILE_STATES: readonly UploadFileState[] = [
  "refused",
  "cancelled",
] as const;

/** `upload_sessions.state`, failing to the terminal `cancelled`. */
export function getUploadSessionStateFromStoredValue(
  value: string,
): UploadSessionState {
  const parsed = uploadSessionStateSchema.safeParse(value);
  return parsed.success ? parsed.data : "cancelled";
}

/** `upload_files.state`, failing to `failed`. */
export function getUploadFileStateFromStoredValue(
  value: string,
): UploadFileState {
  const parsed = uploadFileStateSchema.safeParse(value);
  return parsed.success ? parsed.data : "failed";
}

/** `upload_files.problem_code`, or undefined. */
export function getUploadProblemCodeFromStoredValue(
  value: string | undefined,
): UploadProblemCode | undefined {
  const parsed = uploadProblemCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** `upload_files.capture_source`, or undefined before the ladder has run. */
export function getCaptureSourceFromStoredValue(
  value: string | undefined,
): CaptureSource | undefined {
  const parsed = captureSourceSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** `upload_batch_edits.kind`, failing to `tag`, the least consequential. */
export function getUploadEditKindFromStoredValue(
  value: string,
): UploadEditKind {
  const parsed = uploadEditKindSchema.safeParse(value);
  return parsed.success ? parsed.data : "tag";
}
