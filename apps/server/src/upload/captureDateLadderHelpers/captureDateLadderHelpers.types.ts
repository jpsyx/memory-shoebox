import type {
  CaptureSource,
  ManifestCaptureEvidence,
} from "@memory-shoebox/shared";

/** Inputs for _makeResultFromWallClock. */
export type MakeResultFromWallClockOptions = {
  wallClock: WallClock;
  offsetMinutes: number | undefined;
  timezone: string;
  captureSource: CaptureSource;
};

/** Inputs for _makeResultFromInstant. */
export type MakeResultFromInstantOptions = {
  instantMs: number;
  offsetMinutes: number | undefined;
  timezone: string;
  captureSource: CaptureSource;
};

/** Inputs for getCaptureDateFromEvidence. */
export type GetCaptureDateFromEvidenceOptions = {
  evidence: ManifestCaptureEvidence | undefined;
  originalFilename: string;
  timezone: string;
  declaredAt: string;
};

/**
 * The capture-date ladder described in `upload.md` § The capture-date ladder.
 *
 * - Rung: 1; Evidence: EXIF `DateTimeOriginal`; `capture_source`: `exif`;
 *   Offset: EXIF's own
 * - Rung: 2; Evidence: QuickTime/MP4 `creation_time`; `capture_source`:
 *   `video_metadata`; Offset: undefined
 * - Rung: 3; Evidence: A camera or messenger filename; `capture_source`:
 *   `filename`; Offset: undefined
 * - Rung: 4; Evidence: The File API's `lastModified`; `capture_source`:
 *   `file_mtime`; Offset: undefined
 * - Rung: 5; Evidence: The uploader saying so; `capture_source`:
 *   `uploader_set`; Offset: kept, or undefined
 * - Rung: 6; Evidence: When the file was declared; `capture_source`:
 *   `upload_time`; Offset: undefined
 *
 * Pure: no database and no clock. The browser supplies evidence and this module
 * picks the rung, because `capture_source` has to be the server's own record of
 * how a day was decided. Rung 5 is a separate function, since it is an
 * amendment to a result rather than evidence about a file.
 *
 * **Rungs 2 and 4 read only strict ISO-8601 instants** (a `Z` or a `+HH:MM` on
 * the end): `Date.parse` also takes `"1"` and `"Sep 13"`, and reads a time with
 * no zone in the server's own timezone, which is a different answer on every
 * machine.
 *
 * **With no offset, a wall clock resolves in `shoebox.timezone`** (Decision
 * 10), never in UTC and never in the browser's zone, and the offset stays
 * undefined so the guess is distinguishable from a fact. **With an offset, the
 * day is the file's own**: a 23:30 photograph stays on its evening wherever the
 * Shoebox's zone is set, exactly as `getLocalWallClockFromInstant` reads it
 * back. **A video's `creation_time` is an instant, not a local time** (decision
 * 14): it says when and not where, so its offset is undefined too and its day
 * is the zone's. So is a Pixel filename's stamp, which is UTC, unlike the
 * local-time names of other Android cameras.
 */

/** What the ladder decided for one file. */
export type CaptureDateResult = {
  /** ISO-8601 UTC instant, with milliseconds. */
  capturedAt: string;
  /** `YYYY-MM-DD`, local to the file's offset, or to the zone without one. */
  captureDate: string;
  captureOffsetMinutes: number | undefined;
  captureSource: CaptureSource;
};

/** A local date and a clock time with no zone, as evidence carries them. */
export type WallClock = {
  localDate: string;
  localTime: string;
};

/** Everything a rung reads. */
export type LadderContext = {
  evidence: ManifestCaptureEvidence;
  originalFilename: string;
  timezone: string;
  declaredAt: string;
};

/**
 * What a filename's digits are:
 *
 * - `local`: the camera's wall clock, resolved in `shoebox.timezone`.
 * - `utc`: an instant, kept as it is, with its day read in `shoebox.timezone`
 *   (decision 14), exactly as a video's `creation_time` is.
 * - `date-only`: a day with no clock, which gets noon local.
 */
export type FilenameClock = "local" | "utc" | "date-only";
