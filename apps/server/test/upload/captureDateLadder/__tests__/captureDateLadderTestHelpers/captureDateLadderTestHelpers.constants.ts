import { type CaptureDateResult } from "../../../../../src/upload/captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

/** Madrid is two hours ahead of UTC in September and one in December. */
export const MADRID = "Europe/Madrid";

/** New York is four hours behind UTC in September. */
export const NEW_YORK = "America/New_York";

/** When the manifest declared the file, and rung 6's answer. */
export const DECLARED_AT = "2026-09-27T10:00:00.000Z";

/** The ladder's answer for an Android camera file named at 06:41:32 Madrid. */
export const FILENAME_RESULT: CaptureDateResult = {
  capturedAt: "2026-09-14T04:41:32.000Z",
  captureDate: "2026-09-14",
  captureOffsetMinutes: undefined,
  captureSource: "filename",
};

/** The ladder's answer for an offset-less EXIF date of 06:41:32 Madrid. */
export const OFFSETLESS_EXIF_RESULT: CaptureDateResult = {
  ...FILENAME_RESULT,
  captureSource: "exif",
};

/** The ladder's answer for a file that said nothing, declared at NOW. */
export const UPLOAD_TIME_RESULT: CaptureDateResult = {
  capturedAt: DECLARED_AT,
  captureDate: "2026-09-27",
  captureOffsetMinutes: undefined,
  captureSource: "upload_time",
};

/** A `lastModified` of 18:00 UTC, 20:00 in Madrid. */
export const FILE_MTIME_RESULT: CaptureDateResult = {
  capturedAt: "2026-09-20T18:00:00.000Z",
  captureDate: "2026-09-20",
  captureOffsetMinutes: undefined,
  captureSource: "file_mtime",
};

/** Each name breaks exactly one field, so the round-trip check stands alone. */
export const IMPOSSIBLE_FILENAMES: ReadonlyArray<{
  breakage: string;
  originalFilename: string;
}> = [
  { breakage: "month 13", originalFilename: "IMG_20261301_064132.jpg" },
  { breakage: "day 40", originalFilename: "IMG_20260940_064132.jpg" },
  {
    breakage: "the 30th of February",
    originalFilename: "IMG_20260230_064132.jpg",
  },
  { breakage: "hour 25", originalFilename: "IMG_20260914_250000.jpg" },
  { breakage: "minute 61", originalFilename: "IMG_20260914_066100.jpg" },
  { breakage: "an all-zero date", originalFilename: "IMG_00000000_000000.jpg" },
] as const;
