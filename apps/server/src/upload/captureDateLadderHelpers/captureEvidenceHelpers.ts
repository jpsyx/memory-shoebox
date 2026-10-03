import type {
  LadderContext,
  CaptureDateResult,
  WallClock,
  FilenameClock,
} from "./captureDateLadderHelpers.types.ts";

import {
  EXIF_PATTERN,
  MAX_OFFSET_MINUTES,
  FILENAME_PATTERNS,
  DATE_ONLY_CLOCK_TIME,
} from "./captureDateLadderHelpers.constants.ts";

import {
  makeWallClockFromDigits,
  getPlausibleResultFromCaptureDateResult,
  makeCaptureDateResultFromWallClock,
  getPlausibleMachineInstantFromEvidence,
  makeCaptureDateResultFromInstant,
} from "./captureDateHelpers.ts";

/**
 * Rung 1. An offset outside any real zone is dropped and the wall clock kept,
 * so the photograph still lands on its day, resolved as an offset-less one.
 */
export function getCaptureDateResultFromExif(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const matched = EXIF_PATTERN.exec(context.evidence.exifCapturedAtLocal ?? "");
  const wallClock =
    matched === null ? undefined : makeWallClockFromDigits(matched.slice(1));
  if (wallClock === undefined) {
    return undefined;
  }
  const offset = context.evidence.exifOffsetMinutes;
  const offsetMinutes =
    offset === undefined ||
    offset === null ||
    Math.abs(offset) > MAX_OFFSET_MINUTES
      ? undefined
      : offset;
  return getPlausibleResultFromCaptureDateResult({
    result: makeCaptureDateResultFromWallClock({
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
export function getCaptureDateResultFromVideoMetadata(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const instantMs = getPlausibleMachineInstantFromEvidence({
    value: context.evidence.videoCreationTime ?? undefined,
    declaredAt: context.declaredAt,
  });
  return instantMs === undefined
    ? undefined
    : makeCaptureDateResultFromInstant({
        instantMs,
        offsetMinutes: undefined,
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
        : makeWallClockFromDigits(
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
export function getCaptureDateResultFromFilename(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const found = _getWallClockFromFilename(context.originalFilename);
  if (found === undefined) {
    return undefined;
  }
  const { wallClock, clock } = found;
  return getPlausibleResultFromCaptureDateResult({
    result:
      clock === "utc"
        ? makeCaptureDateResultFromInstant({
            instantMs: Date.parse(
              `${wallClock.localDate}T${wallClock.localTime}Z`,
            ),
            offsetMinutes: undefined,
            timezone: context.timezone,
            captureSource: "filename",
          })
        : makeCaptureDateResultFromWallClock({
            wallClock,
            offsetMinutes: undefined,
            timezone: context.timezone,
            captureSource: "filename",
          }),
    declaredAt: context.declaredAt,
  });
}

/** Rung 4: `lastModified`, an instant, its day in the zone. */
export function getCaptureDateResultFromLastModified(
  context: Readonly<LadderContext>,
): CaptureDateResult | undefined {
  const instantMs = getPlausibleMachineInstantFromEvidence({
    value: context.evidence.lastModifiedAt ?? undefined,
    declaredAt: context.declaredAt,
  });
  return instantMs === undefined
    ? undefined
    : makeCaptureDateResultFromInstant({
        instantMs,
        offsetMinutes: undefined,
        timezone: context.timezone,
        captureSource: "file_mtime",
      });
}
