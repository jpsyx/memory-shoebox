import type { FilenameClock } from "./captureDateLadderHelpers.types.ts";

/**
 * How far past the declaration a capture time may claim to be: one day.
 *
 * A camera that writes local time into a field meant for UTC is up to
 * fourteen hours ahead, and that is still the right day more often than a
 * fallback is. Further than a day is a clock that was never set.
 */
export const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** No real zone is further than fourteen hours from UTC. */
export const MAX_OFFSET_MINUTES = 14 * 60;

/**
 * The clock time a date-only filename gets: noon.
 *
 * WhatsApp names the day and not the moment. Noon is the time furthest from
 * both midnights, so neither a daylight-saving shift nor a later change of
 * `shoebox.timezone` by up to twelve hours can move the file to another day.
 */
export const DATE_ONLY_CLOCK_TIME = "12:00:00";

/**
 * EXIF `DateTimeOriginal`, as the browser forwards it
 * (`2026-09-14T06:41:32`) or as the tag itself spells it
 * (`2026:09:14 06:41:32`), with any sub-second digits ignored.
 */
export const EXIF_PATTERN =
  /^(\d{4})[-:](\d{2})[-:](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/u;

/**
 * The filename patterns rung 3 reads, each capturing year, month and day,
 * then hour, minute and second when the name carries a clock.
 */
export const FILENAME_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  clock: FilenameClock;
}> = [
  // Android: IMG_20260914_064132, VID_20260914_064132, and Samsung's camera,
  // which names files 20260914_064132 with no prefix at all.
  {
    pattern: /^(?:(?:IMG|VID)_)?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/iu,
    clock: "local",
  },
  // Pixel: PXL_20260914_064132123, stamped in UTC (milliseconds trail the
  // seconds and are ignored).
  {
    pattern: /^PXL_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/iu,
    clock: "utc",
  },
  // Dropbox and the camera-upload exports that copy it:
  // "2026-01-17 19.23.33.jpg".
  {
    pattern: /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})/u,
    clock: "local",
  },
  // WhatsApp: IMG-20260914-WA0001, VID-20260914-WA0001. The day only.
  {
    pattern: /^(?:IMG|VID)-(\d{4})(\d{2})(\d{2})-WA\d+/iu,
    clock: "date-only",
  },
] as const;

/**
 * A strict ISO-8601 instant: date, time, and a `Z` or a `+HH:MM` on the end,
 * capturing year to second so the digits can be checked as a real moment.
 */
export const STRICT_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
