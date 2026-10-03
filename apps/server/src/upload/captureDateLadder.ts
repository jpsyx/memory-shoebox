import type {
  CaptureSource,
  ManifestCaptureEvidence,
} from "@memory-shoebox/shared";
import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";
import {
  getLocalWallClockFromInstant,
  makeInstantFromLocalWallClock,
} from "../time/wallClockHelpers.ts";

/**
 * The capture-date ladder: `upload.md` § The capture-date ladder, with the
 * step design's decision 12.
 *
 * | Rung | Evidence                           | `capture_source` | Offset     |
 * | ---- | ---------------------------------- | ---------------- | ---------- |
 * | 1    | EXIF `DateTimeOriginal`            | `exif`           | EXIF's own |
 * | 2    | QuickTime/MP4 `creation_time`      | `video_metadata` | null       |
 * | 3    | A camera or messenger filename     | `filename`       | null       |
 * | 4    | The File API's `lastModified`      | `file_mtime`     | null       |
 * | 5    | The uploader saying so             | `uploader_set`   | null       |
 * | 6    | When the file was declared         | `upload_time`    | null       |
 *
 * Pure: no database and no clock. The browser supplies evidence and this
 * module picks the rung, because `capture_source` has to be the server's own
 * record of how a day was decided. Rung 5 is a separate function, since it is
 * an amendment to a result rather than evidence about a file.
 *
 * **With no offset, a wall clock resolves in `shoebox.timezone`** (Decision
 * 10), never in UTC and never in the browser's zone, and the offset stays
 * null so the guess is distinguishable from a fact. **With an offset, the
 * day is the file's own**: a 23:30 photograph stays on its evening wherever
 * the Shoebox's zone is set, exactly as `getLocalWallClockFromInstant` reads
 * it back. **A video's `creation_time` is an instant, not a local time**
 * (decision 14): it says when and not where, so its offset is null too and
 * its day is the zone's.
 */

/** What the ladder decided for one file. */
export type CaptureDateResult = {
  /** ISO-8601 UTC instant, with milliseconds. */
  capturedAt: string;
  /** `YYYY-MM-DD`, local to the file's offset, or to the zone without one. */
  captureDate: string;
  captureOffsetMinutes: number | null;
  captureSource: CaptureSource;
};

/** A local date and a clock time with no zone, as evidence carries them. */
type WallClock = {
  localDate: string;
  localTime: string;
};

/** Everything a rung reads. */
type LadderContext = {
  evidence: ManifestCaptureEvidence;
  originalFilename: string;
  timezone: string;
  declaredAt: string;
};

/**
 * How far past the declaration a capture time may claim to be: one day.
 *
 * A camera that writes local time into a field meant for UTC is up to
 * fourteen hours ahead, and that is still the right day more often than a
 * fallback is. Further than a day is a clock that was never set.
 */
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** No real zone is further than fourteen hours from UTC. */
const MAX_OFFSET_MINUTES = 14 * 60;

/**
 * The clock time a date-only filename gets: noon.
 *
 * WhatsApp names the day and not the moment. Noon is the time furthest from
 * both midnights, so neither a daylight-saving shift nor a later change of
 * `shoebox.timezone` by up to twelve hours can move the file to another day.
 */
const DATE_ONLY_CLOCK_TIME = "12:00:00";

/**
 * EXIF `DateTimeOriginal`, as the browser forwards it
 * (`2026-09-14T06:41:32`) or as the tag itself spells it
 * (`2026:09:14 06:41:32`), with any sub-second digits ignored.
 */
const EXIF_PATTERN =
  /^(\d{4})[-:](\d{2})[-:](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/u;

/**
 * The filename patterns rung 3 reads, each capturing year, month and day,
 * then hour, minute and second when the name carries a clock.
 */
const FILENAME_PATTERNS: ReadonlyArray<{ pattern: RegExp; hasClock: boolean }> =
  [
    // Android and Pixel: IMG_20260914_064132, VID_20260914_064132,
    // PXL_20260914_064132123 (milliseconds trail the seconds), and Samsung's
    // camera, which names files 20260914_064132 with no prefix at all.
    {
      pattern:
        /^(?:(?:IMG|VID|PXL)_)?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/iu,
      hasClock: true,
    },
    // Dropbox and the camera-upload exports that copy it:
    // "2026-01-17 19.23.33.jpg".
    {
      pattern: /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})/u,
      hasClock: true,
    },
    // WhatsApp: IMG-20260914-WA0001, VID-20260914-WA0001. The day only.
    {
      pattern: /^(?:IMG|VID)-(\d{4})(\d{2})(\d{2})-WA\d+/iu,
      hasClock: false,
    },
  ];

/**
 * Digits to a wall clock, or nothing when they name no real moment.
 *
 * The round trip through `Date.UTC` is the check: month 13, the 30th of
 * February and 25:00 all come back as some other moment, and the all-zero
 * date an unset camera clock writes comes back in 1899.
 */
function _makeWallClockFromDigits(
  digits: readonly string[],
): WallClock | undefined {
  const [year, month, day, hour, minute, second] = digits;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return undefined;
  }
  const localDate = `${year}-${month}-${day}`;
  const localTime = `${hour}:${minute}:${second}`;
  const roundTrip = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  )
    .toISOString()
    .slice(0, 19);
  return roundTrip === `${localDate}T${localTime}`
    ? { localDate, localTime }
    : undefined;
}

/** The day an instant falls on: at its own offset, or in the zone. */
function _getCaptureDateFromInstant(options: {
  instant: string;
  offsetMinutes: number | null;
  timezone: string;
}): string {
  if (options.offsetMinutes === null) {
    return getLocalDayFromInstant({
      instant: options.instant,
      timezone: options.timezone,
    });
  }
  return new Date(Date.parse(options.instant) + options.offsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** A wall clock, at an offset or in the zone, as a ladder result. */
function _makeResultFromWallClock(options: {
  wallClock: WallClock;
  offsetMinutes: number | null;
  timezone: string;
  captureSource: CaptureSource;
}): CaptureDateResult {
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.wallClock.localDate,
    localTime: options.wallClock.localTime,
    offsetMinutes: options.offsetMinutes,
    timezone: options.timezone,
  });
  return {
    capturedAt,
    captureDate: _getCaptureDateFromInstant({
      instant: capturedAt,
      offsetMinutes: options.offsetMinutes,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: options.offsetMinutes,
    captureSource: options.captureSource,
  };
}

/** An instant a machine reported, as a ladder result. */
function _makeResultFromInstant(options: {
  instantMs: number;
  offsetMinutes: number | null;
  timezone: string;
  captureSource: CaptureSource;
}): CaptureDateResult {
  const capturedAt = new Date(options.instantMs).toISOString();
  return {
    capturedAt,
    captureDate: _getCaptureDateFromInstant({
      instant: capturedAt,
      offsetMinutes: options.offsetMinutes,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: options.offsetMinutes,
    captureSource: options.captureSource,
  };
}

/** Whether a capture time is no further past the declaration than the skew. */
function _isNotInTheFuture(options: {
  instantMs: number;
  declaredAt: string;
}): boolean {
  return options.instantMs <= Date.parse(options.declaredAt) + FUTURE_SKEW_MS;
}

/**
 * An instant a machine clock reported, or nothing when it is implausible.
 *
 * Rungs 2 and 4 report instants rather than wall clocks, and both have a
 * classic broken value: a QuickTime header left at its 1904 epoch, and a
 * clock that reads Unix zero. Anything at or before Unix zero is refused,
 * which covers both, as is anything past the skew. The floor is for these
 * two rungs only: a scanned 1965 photograph can carry a real EXIF date.
 */
function _getPlausibleMachineInstant(options: {
  value: string | null | undefined;
  declaredAt: string;
}): number | undefined {
  const instantMs =
    options.value === undefined || options.value === null
      ? Number.NaN
      : Date.parse(options.value);
  if (!Number.isFinite(instantMs) || instantMs <= 0) {
    return undefined;
  }
  return _isNotInTheFuture({ instantMs, declaredAt: options.declaredAt })
    ? instantMs
    : undefined;
}

/** A result, unless its instant is past the skew. */
function _keepIfNotInTheFuture(options: {
  result: CaptureDateResult;
  declaredAt: string;
}): CaptureDateResult | undefined {
  return _isNotInTheFuture({
    instantMs: Date.parse(options.result.capturedAt),
    declaredAt: options.declaredAt,
  })
    ? options.result
    : undefined;
}

/**
 * Rung 1. An offset outside any real zone is dropped and the wall clock kept,
 * so the photograph still lands on its day, resolved as an offset-less one.
 */
function _getResultFromExif(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const matched = EXIF_PATTERN.exec(context.evidence.exifCapturedAtLocal ?? "");
  const wallClock =
    matched === null ? undefined : _makeWallClockFromDigits(matched.slice(1));
  if (wallClock === undefined) {
    return undefined;
  }
  const offset = context.evidence.exifOffsetMinutes;
  const offsetMinutes =
    offset === undefined ||
    offset === null ||
    Math.abs(offset) > MAX_OFFSET_MINUTES
      ? null
      : offset;
  return _keepIfNotInTheFuture({
    result: _makeResultFromWallClock({
      wallClock,
      offsetMinutes,
      timezone: context.timezone,
      captureSource: "exif",
    }),
    declaredAt: context.declaredAt,
  });
}

/**
 * Rung 2. `creation_time` is UTC by specification, which makes it an instant
 * and says nothing about where it was taken (decision 14). So the instant is
 * kept as it is, the offset is null, and the day is the zone's: offset 0
 * would put a video shot at 00:30 in Madrid on the previous day.
 */
function _getResultFromVideoMetadata(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const instantMs = _getPlausibleMachineInstant({
    value: context.evidence.videoCreationTime,
    declaredAt: context.declaredAt,
  });
  return instantMs === undefined
    ? undefined
    : _makeResultFromInstant({
        instantMs,
        offsetMinutes: null,
        timezone: context.timezone,
        captureSource: "video_metadata",
      });
}

/** Rung 3: the first pattern that names a real moment. */
function _getResultFromFilename(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const wallClock = FILENAME_PATTERNS.reduce<WallClock | undefined>(
    (found, { pattern, hasClock }) => {
      if (found !== undefined) {
        return found;
      }
      const matched = pattern.exec(context.originalFilename);
      if (matched === null) {
        return undefined;
      }
      const digits = matched.slice(1);
      return _makeWallClockFromDigits(
        hasClock ? digits : [...digits, ...DATE_ONLY_CLOCK_TIME.split(":")],
      );
    },
    undefined,
  );
  return wallClock === undefined
    ? undefined
    : _keepIfNotInTheFuture({
        result: _makeResultFromWallClock({
          wallClock,
          offsetMinutes: null,
          timezone: context.timezone,
          captureSource: "filename",
        }),
        declaredAt: context.declaredAt,
      });
}

/** Rung 4: `lastModified`, an instant, its day in the zone. */
function _getResultFromLastModified(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const instantMs = _getPlausibleMachineInstant({
    value: context.evidence.lastModifiedAt,
    declaredAt: context.declaredAt,
  });
  return instantMs === undefined
    ? undefined
    : _makeResultFromInstant({
        instantMs,
        offsetMinutes: null,
        timezone: context.timezone,
        captureSource: "file_mtime",
      });
}

/**
 * Rungs 1 to 4 then 6, over what the browser read from one file's headers.
 *
 * Each rung either answers or falls through, and an implausible value falls
 * through rather than winning: a 1904-epoch video date reaches the filename.
 * Rung 6 is `declaredAt`, the time the file was declared, not the commit
 * time: the ladder runs at the manifest, before commit, and
 * `original_captured_at` freezes the moment it first runs (decision 12).
 *
 * @param options.evidence What the browser read, or nothing.
 * @param options.originalFilename The name the file was picked under.
 * @param options.timezone The `shoebox.timezone` setting.
 * @param options.declaredAt When the manifest declared the file, ISO-8601.
 */
export function getCaptureDateFromEvidence(options: {
  evidence: ManifestCaptureEvidence | undefined;
  originalFilename: string;
  timezone: string;
  declaredAt: string;
}): CaptureDateResult {
  const context = { ...options, evidence: options.evidence ?? {} };
  return (
    _getResultFromExif(context) ??
    _getResultFromVideoMetadata(context) ??
    _getResultFromFilename(context) ??
    _getResultFromLastModified(context) ??
    _makeResultFromInstant({
      instantMs: Date.parse(options.declaredAt),
      offsetMinutes: null,
      timezone: options.timezone,
      captureSource: "upload_time",
    })
  );
}

/** `HH:MM:SS` as written in an ISO-8601 string, or noon without one. */
function _getClockTimeAsWritten(isoDateTime: string): string {
  const matched = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}(?::\d{2})?)/u.exec(
    isoDateTime,
  );
  return matched?.[1] ?? DATE_ONLY_CLOCK_TIME;
}

/**
 * Rung 5: the uploader moving a file to another day, before ingest.
 *
 * **The clock time is kept and only the date changes**, so a 06:41
 * photograph becomes 06:41 on the new day and no fact is invented
 * (`upload.md` § the `milestone-fix` amendment). The date is read exactly as
 * the amendment wrote it, its first ten characters, because the uploader
 * picked a day on the Shoebox's calendar and converting it through any zone
 * could move it. The result has no offset, as rung 5 never does, so the kept
 * clock resolves in `shoebox.timezone`.
 *
 * @param options.capturedAt The amendment as sent.
 * @param options.previous What the ladder had decided, whose clock is kept.
 *   Null only for a row the ladder has not run on, when the amendment's own
 *   clock time, as written, is used instead.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function getCaptureDateFromUploaderDate(options: {
  capturedAt: string;
  previous: CaptureDateResult | null;
  timezone: string;
}): CaptureDateResult {
  const localTime =
    options.previous === null
      ? _getClockTimeAsWritten(options.capturedAt)
      : getLocalWallClockFromInstant({
          instant: options.previous.capturedAt,
          offsetMinutes: options.previous.captureOffsetMinutes,
          timezone: options.timezone,
        });
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.capturedAt.slice(0, 10),
    localTime,
    offsetMinutes: null,
    timezone: options.timezone,
  });
  return {
    capturedAt,
    captureDate: getLocalDayFromInstant({
      instant: capturedAt,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: null,
    captureSource: "uploader_set",
  };
}
