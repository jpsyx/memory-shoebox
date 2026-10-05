import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";
import { getLocalWallClockFromInstant } from "../time/wallClockHelpers.ts";

type LocalDateOptions = { localDate: string; timezone: string };
type DateSearchOptions = LocalDateOptions & {
  beforeMillis: number;
  atOrAfterMillis: number;
};

function _getMidnightCandidatesFromLocalDate(
  options: Readonly<LocalDateOptions>,
): number[] {
  const naiveMidnight = Date.parse(`${options.localDate}T00:00:00Z`);
  // Nearby instants supply offsets on both sides of a date's zone transition.
  return Array.from({ length: 7 }, (_, probeIndex) => {
    const probeMillis = naiveMidnight + (probeIndex - 3) * 12 * 3_600_000;
    const instant = new Date(probeMillis).toISOString();
    const localDate = getLocalDayFromInstant({
      instant,
      timezone: options.timezone,
    });
    const localTime = getLocalWallClockFromInstant({
      instant,
      timezone: options.timezone,
      offsetMinutes: null,
    });
    const offsetMillis = Date.parse(`${localDate}T${localTime}Z`) - probeMillis;
    return naiveMidnight - offsetMillis;
  });
}

function _isRequestedMidnight(
  options: Readonly<LocalDateOptions & { instantMillis: number }>,
): boolean {
  const instant = new Date(options.instantMillis).toISOString();
  return (
    getLocalDayFromInstant({ instant, timezone: options.timezone }) ===
      options.localDate &&
    getLocalWallClockFromInstant({
      instant,
      timezone: options.timezone,
      offsetMinutes: null,
    }) === "00:00:00"
  );
}

function _getDateBoundaryFromSearch(
  options: Readonly<DateSearchOptions>,
): number {
  if (options.atOrAfterMillis - options.beforeMillis <= 1) {
    return options.atOrAfterMillis;
  }
  const midpointMillis = Math.floor(
    (options.beforeMillis + options.atOrAfterMillis) / 2,
  );
  const midpointDate = getLocalDayFromInstant({
    instant: new Date(midpointMillis).toISOString(),
    timezone: options.timezone,
  });
  return _getDateBoundaryFromSearch({
    ...options,
    beforeMillis:
      midpointDate < options.localDate ? midpointMillis : options.beforeMillis,
    atOrAfterMillis:
      midpointDate < options.localDate
        ? options.atOrAfterMillis
        : midpointMillis,
  });
}

/** Finds a date's earliest instant, or the next date if the date was skipped. */
export function getPresenceDayStartFromLocalDate(
  options: Readonly<LocalDateOptions>,
): string {
  const validMidnights = _getMidnightCandidatesFromLocalDate(options).filter(
    (instantMillis) => {
      return _isRequestedMidnight({ ...options, instantMillis });
    },
  );
  if (validMidnights.length > 0) {
    return new Date(Math.min(...validMidnights)).toISOString();
  }
  // A midnight gap starts at the transition, not at a shifted wall clock.
  // IANA offsets fit inside this 72-hour bracket around the naive UTC date.
  const naiveMidnight = Date.parse(`${options.localDate}T00:00:00Z`);
  return new Date(
    _getDateBoundaryFromSearch({
      ...options,
      beforeMillis: naiveMidnight - 36 * 3_600_000,
      atOrAfterMillis: naiveMidnight + 36 * 3_600_000,
    }),
  ).toISOString();
}
