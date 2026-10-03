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
 * | Rung | Evidence                           | `capture_source` | Offset        |
 * | ---- | ---------------------------------- | ---------------- | ------------- |
 * | 1    | EXIF `DateTimeOriginal`            | `exif`           | EXIF's own    |
 * | 2    | QuickTime/MP4 `creation_time`      | `video_metadata` | null          |
 * | 3    | A camera or messenger filename     | `filename`       | null          |
 * | 4    | The File API's `lastModified`      | `file_mtime`     | null          |
 * | 5    | The uploader saying so             | `uploader_set`   | kept, or null |
 * | 6    | When the file was declared         | `upload_time`    | null          |
 *
 * Pure: no database and no clock. The browser supplies evidence and this
 * module picks the rung, because `capture_source` has to be the server's own
 * record of how a day was decided. Rung 5 is a separate function, since it is
 * an amendment to a result rather than evidence about a file.
 *
 * **Rungs 2 and 4 read only strict ISO-8601 instants** (a `Z` or a `+HH:MM`
 * on the end): `Date.parse` also takes `"1"` and `"Sep 13"`, and reads a time
 * with no zone in the server's own timezone, which is a different answer on
 * every machine.
 *
 * **With no offset, a wall clock resolves in `shoebox.timezone`** (Decision
 * 10), never in UTC and never in the browser's zone, and the offset stays
 * null so the guess is distinguishable from a fact. **With an offset, the
 * day is the file's own**: a 23:30 photograph stays on its evening wherever
 * the Shoebox's zone is set, exactly as `getLocalWallClockFromInstant` reads
 * it back. **A video's `creation_time` is an instant, not a local time**
 * (decision 14): it says when and not where, so its offset is null too and
 * its day is the zone's. So is a Pixel filename's stamp, which is UTC, unlike
 * the local-time names of other Android cameras.
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
 * What a filename's digits are:
 *
 * - `local`: the camera's wall clock, resolved in `shoebox.timezone`.
 * - `utc`: an instant, kept as it is, with its day read in `shoebox.timezone`
 *   (decision 14), exactly as a video's `creation_time` is.
 * - `date-only`: a day with no clock, which gets noon local.
 */
type FilenameClock = "local" | "utc" | "date-only";

/**
 * The filename patterns rung 3 reads, each capturing year, month and day,
 * then hour, minute and second when the name carries a clock.
 */
const FILENAME_PATTERNS: ReadonlyArray<{
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
];

/**
 * A strict ISO-8601 instant: date, time, and a `Z` or a `+HH:MM` on the end,
 * capturing year to second so the digits can be checked as a real moment.
 */
const STRICT_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * The sources whose clock records when a file was saved or declared, not when
 * its photograph was taken. An amendment never keeps such a clock.
 */
const SOURCES_WITHOUT_A_PHOTOGRAPH_CLOCK: readonly CaptureSource[] = [
  "file_mtime",
  "upload_time",
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
 * An instant from a strict ISO-8601 string, or nothing for any other string.
 *
 * `Date.parse` alone is too generous: it takes `"1"` and `"Sep 13"`, rolls
 * the 30th of February into March, and reads a time with no zone in the
 * server's own timezone. So the shape is checked first, then the digits as a
 * real moment, and only then is the string parsed.
 */
function _getInstantMsFromStrictIso(value: string): number | undefined {
  const matched = STRICT_INSTANT_PATTERN.exec(value);
  if (
    matched === null ||
    _makeWallClockFromDigits(matched.slice(1, 7)) === undefined
  ) {
    return undefined;
  }
  const instantMs = Date.parse(value);
  return Number.isFinite(instantMs) ? instantMs : undefined;
}

/**
 * An instant a machine clock reported, or nothing when it is implausible.
 *
 * Rungs 2 and 4 report instants rather than wall clocks, and both have a
 * classic broken value: a QuickTime header left at its 1904 epoch, and a
 * clock that reads Unix zero. Anything at or before Unix zero is refused,
 * which covers both, as is anything past the skew or not a strict ISO-8601
 * instant. The floor is for these two rungs only: a scanned 1965 photograph
 * can carry a real EXIF date.
 */
function _getPlausibleMachineInstant(options: {
  value: string | null | undefined;
  declaredAt: string;
}): number | undefined {
  const instantMs =
    options.value === undefined || options.value === null
      ? undefined
      : _getInstantMsFromStrictIso(options.value);
  if (instantMs === undefined || instantMs <= 0) {
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

/** The first filename pattern that names a real moment, and its clock. */
function _getWallClockFromFilename(
  originalFilename: string,
): { wallClock: WallClock; clock: FilenameClock } | undefined {
  return FILENAME_PATTERNS.map(({ pattern, clock }) => {
    const digits = pattern.exec(originalFilename)?.slice(1);
    const wallClock =
      digits === undefined
        ? undefined
        : _makeWallClockFromDigits(
            clock === "date-only"
              ? [...digits, ...DATE_ONLY_CLOCK_TIME.split(":")]
              : digits,
          );
    return wallClock === undefined ? undefined : { wallClock, clock };
  }).find((found) => {
    return found !== undefined;
  });
}

/**
 * Rung 3. A Pixel name is a UTC stamp, so it is an instant and takes the path
 * a video's `creation_time` does (decision 14); every other name is the
 * camera's own wall clock, resolved in the zone.
 */
function _getResultFromFilename(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const found = _getWallClockFromFilename(context.originalFilename);
  if (found === undefined) {
    return undefined;
  }
  const { wallClock, clock } = found;
  return _keepIfNotInTheFuture({
    result:
      clock === "utc"
        ? _makeResultFromInstant({
            instantMs: Date.parse(
              `${wallClock.localDate}T${wallClock.localTime}Z`,
            ),
            offsetMinutes: null,
            timezone: context.timezone,
            captureSource: "filename",
          })
        : _makeResultFromWallClock({
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
export function getCaptureDateFromEvidence(
  options: Readonly<{
    evidence: ManifestCaptureEvidence | undefined;
    originalFilename: string;
    timezone: string;
    declaredAt: string;
  }>,
): CaptureDateResult {
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

/**
 * The clock and offset an amendment keeps from what the ladder had decided.
 *
 * **A clock the ladder invented is not kept**: `file_mtime` and `upload_time`
 * record when the file was saved or declared, so keeping one invents a capture
 * time. Those, and a row the ladder never ran on, get noon, as a date-only
 * filename does, and such files never join a burst (design decision 16).
 * Every other source's clock was read from the file or picked by the
 * uploader, and is kept together with its offset.
 */
function _getClockToKeepFromPrevious(
  options: Readonly<{
    previous: CaptureDateResult | null;
    timezone: string;
  }>,
): { localTime: string; offsetMinutes: number | null } {
  const { previous } = options;
  if (
    previous === null ||
    SOURCES_WITHOUT_A_PHOTOGRAPH_CLOCK.includes(previous.captureSource)
  ) {
    return { localTime: DATE_ONLY_CLOCK_TIME, offsetMinutes: null };
  }
  return {
    localTime: getLocalWallClockFromInstant({
      instant: previous.capturedAt,
      offsetMinutes: previous.captureOffsetMinutes,
      timezone: options.timezone,
    }),
    offsetMinutes: previous.captureOffsetMinutes,
  };
}

/**
 * Rung 5: the uploader moving a file to another day, before ingest.
 *
 * **The clock time and the offset are kept and only the date changes**, so a
 * 06:41 photograph becomes 06:41 on the new day and no fact is invented
 * (`upload.md` § the `milestone-fix` amendment), and a photograph taken at
 * -04:00 stays at -04:00 in a Shoebox set to another zone: moving the day does
 * not move the camera to another country, as it does not for an item's date
 * correction. A previous result without an offset resolves the kept clock in
 * `shoebox.timezone`. The one clock that is not kept is one the ladder
 * invented (see {@link _getClockToKeepFromPrevious}), which becomes noon.
 *
 * The date is read exactly as the amendment wrote it, its first ten
 * characters, because the uploader picked a day on the Shoebox's calendar and
 * converting it through any zone could move it.
 *
 * @param options.capturedAt The amendment as sent.
 * @param options.previous What the ladder had decided, whose clock and offset
 *   are kept. Null only for a row the ladder has not run on.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function getCaptureDateFromUploaderDate(
  options: Readonly<{
    capturedAt: string;
    previous: CaptureDateResult | null;
    timezone: string;
  }>,
): CaptureDateResult {
  const { localTime, offsetMinutes } = _getClockToKeepFromPrevious(options);
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.capturedAt.slice(0, 10),
    localTime,
    offsetMinutes,
    timezone: options.timezone,
  });
  return {
    capturedAt,
    captureDate: _getCaptureDateFromInstant({
      instant: capturedAt,
      offsetMinutes,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: offsetMinutes,
    captureSource: "uploader_set",
  };
}
