import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";

import { makeInstantFromLocalWallClock } from "../../time/wallClockHelpers.ts";

import type {
  WallClock,
  MakeResultFromWallClockOptions,
  CaptureDateResult,
  MakeResultFromInstantOptions,
} from "./captureDateLadderHelpers.types.ts";

import {
  FUTURE_SKEW_MS,
  STRICT_INSTANT_PATTERN,
} from "./captureDateLadderHelpers.constants.ts";

/**
 * Digits to a wall clock, or nothing when they name no real moment.
 */
export function makeWallClockFromDigits(
  digits: readonly string[],
): WallClock | undefined {
  // The round trip through `Date.UTC` is the check: month 13, the 30th of
  // February and 25:00 all come back as some other moment, and the all-zero
  // date an unset camera clock writes comes back in 1899.

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
export function getCaptureDateFromInstant(
  options: Readonly<{
    instant: string;
    offsetMinutes: number | undefined;
    timezone: string;
  }>,
): string {
  return options.offsetMinutes === undefined
    ? getLocalDayFromInstant({
        instant: options.instant,
        timezone: options.timezone,
      })
    : new Date(Date.parse(options.instant) + options.offsetMinutes * 60_000)
        .toISOString()
        .slice(0, 10);
}

/** A wall clock, at an offset or in the zone, as a ladder result. */
export function makeCaptureDateResultFromWallClock(
  options: Readonly<MakeResultFromWallClockOptions>,
): CaptureDateResult {
  const capturedAt = makeInstantFromLocalWallClock({
    localDate: options.wallClock.localDate,
    localTime: options.wallClock.localTime,
    offsetMinutes: options.offsetMinutes ?? null,
    timezone: options.timezone,
  });
  return {
    capturedAt,
    captureDate: getCaptureDateFromInstant({
      instant: capturedAt,
      offsetMinutes: options.offsetMinutes,
      timezone: options.timezone,
    }),
    captureOffsetMinutes: options.offsetMinutes,
    captureSource: options.captureSource,
  };
}

/** An instant a machine reported, as a ladder result. */
export function makeCaptureDateResultFromInstant(
  options: Readonly<MakeResultFromInstantOptions>,
): CaptureDateResult {
  const capturedAt = new Date(options.instantMs).toISOString();
  return {
    capturedAt,
    captureDate: getCaptureDateFromInstant({
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
    makeWallClockFromDigits(matched.slice(1, 7)) === undefined
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
export function getPlausibleMachineInstantFromEvidence(
  options: Readonly<{
    value: string | undefined;
    declaredAt: string;
  }>,
): number | undefined {
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
export function getPlausibleResultFromCaptureDateResult(
  options: Readonly<{
    result: CaptureDateResult;
    declaredAt: string;
  }>,
): CaptureDateResult | undefined {
  return _isNotInTheFuture({
    instantMs: Date.parse(options.result.capturedAt),
    declaredAt: options.declaredAt,
  })
    ? options.result
    : undefined;
}
