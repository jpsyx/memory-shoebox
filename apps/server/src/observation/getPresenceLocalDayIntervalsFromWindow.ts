import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";
import { getLocalWallClockFromInstant } from "../time/wallClockHelpers.ts";

type OffsetSample = { instantMillis: number; offsetMillis: number };
type PresenceLocalDayInterval = {
  localDate: string;
  startsAt: string;
  endsAt: string;
};
type WindowBounds = {
  firstLocalDate: string;
  lastLocalDate: string;
  beforeMillis: number;
  afterMillis: number;
};

const DAY_MILLIS = 86_400_000;
// Probes assume no offset change and reversal within the same six hours.
// A shorter-lived offset regime could be missed; this is not a history proof.
const PROBE_STEP_MILLIS = 6 * 3_600_000;

function _getOffsetMillisFromInstant(
  options: Readonly<{ instantMillis: number; timezone: string }>,
): number {
  const instant = new Date(options.instantMillis).toISOString();
  const localDate = getLocalDayFromInstant({
    instant,
    timezone: options.timezone,
  });
  const localTime = getLocalWallClockFromInstant({
    instant,
    timezone: options.timezone,
    offsetMinutes: null,
  });
  // The wall-clock reader has second precision; discard the instant's millis.
  return (
    Date.parse(`${localDate}T${localTime}Z`) -
    Math.floor(options.instantMillis / 1000) * 1000
  );
}

function _getTransitionMillisFromSamples(
  options: Readonly<{
    before: OffsetSample;
    after: OffsetSample;
    timezone: string;
  }>,
): number {
  if (options.after.instantMillis - options.before.instantMillis <= 1) {
    return options.after.instantMillis;
  }
  const midpointMillis = Math.floor(
    (options.before.instantMillis + options.after.instantMillis) / 2,
  );
  const midpoint = {
    instantMillis: midpointMillis,
    offsetMillis: _getOffsetMillisFromInstant({
      instantMillis: midpointMillis,
      timezone: options.timezone,
    }),
  };
  return _getTransitionMillisFromSamples({
    before:
      midpoint.offsetMillis === options.before.offsetMillis
        ? midpoint
        : options.before,
    after:
      midpoint.offsetMillis === options.before.offsetMillis
        ? options.after
        : midpoint,
    timezone: options.timezone,
  });
}

function _getBoundsFromWindow(
  options: Readonly<{ now: string; timezone: string }>,
): WindowBounds {
  const lastLocalDate = getLocalDayFromInstant({
    instant: options.now,
    timezone: options.timezone,
  });
  const todayMillis = Date.parse(`${lastLocalDate}T00:00:00Z`);
  const firstDayMillis = todayMillis - 89 * DAY_MILLIS;
  // Padding includes every UTC interval of each local date across date jumps.
  return {
    firstLocalDate: new Date(firstDayMillis).toISOString().slice(0, 10),
    lastLocalDate,
    beforeMillis: firstDayMillis - 2 * DAY_MILLIS,
    afterMillis: todayMillis + 3 * DAY_MILLIS,
  };
}

function _getOffsetSamplesFromBounds(
  options: Readonly<{ bounds: WindowBounds; timezone: string }>,
): OffsetSample[] {
  const sampleCount =
    Math.ceil(
      (options.bounds.afterMillis - options.bounds.beforeMillis) /
        PROBE_STEP_MILLIS,
    ) + 1;
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const instantMillis = Math.min(
      options.bounds.beforeMillis + sampleIndex * PROBE_STEP_MILLIS,
      options.bounds.afterMillis,
    );
    return {
      instantMillis,
      offsetMillis: _getOffsetMillisFromInstant({
        instantMillis,
        timezone: options.timezone,
      }),
    };
  });
}

function _getOffsetBoundariesFromSamples(
  options: Readonly<{
    samples: readonly OffsetSample[];
    bounds: WindowBounds;
    timezone: string;
  }>,
): number[] {
  const transitions = options.samples.slice(1).flatMap((after, sampleIndex) => {
    const before = options.samples[sampleIndex];
    if (before === undefined || before.offsetMillis === after.offsetMillis) {
      return [];
    }
    return [
      _getTransitionMillisFromSamples({
        before,
        after,
        timezone: options.timezone,
      }),
    ];
  });
  return [
    options.bounds.beforeMillis,
    ...transitions,
    options.bounds.afterMillis,
  ];
}

function _getMidnightsFromOffsetBoundaries(
  options: Readonly<{ boundaries: readonly number[]; timezone: string }>,
): number[] {
  return options.boundaries
    .slice(0, -1)
    .flatMap((startsMillis, boundaryIndex) => {
      const endsMillis = options.boundaries[boundaryIndex + 1] ?? startsMillis;
      const offsetMillis = _getOffsetMillisFromInstant({
        instantMillis: startsMillis,
        timezone: options.timezone,
      });
      const firstMidnightMillis =
        Math.ceil((startsMillis + offsetMillis) / DAY_MILLIS) * DAY_MILLIS -
        offsetMillis;
      const midnightCount = Math.max(
        0,
        Math.ceil((endsMillis - firstMidnightMillis) / DAY_MILLIS),
      );
      return Array.from({ length: midnightCount }, (_, midnightIndex) => {
        return firstMidnightMillis + midnightIndex * DAY_MILLIS;
      });
    });
}

function _getLocalDayIntervalsFromBoundaries(
  options: Readonly<{
    boundaries: readonly number[];
    bounds: WindowBounds;
    timezone: string;
  }>,
): PresenceLocalDayInterval[] {
  return options.boundaries
    .slice(0, -1)
    .map((startsMillis, boundaryIndex) => {
      const startsAt = new Date(startsMillis).toISOString();
      const endsAt = new Date(
        options.boundaries[boundaryIndex + 1] ?? startsMillis,
      ).toISOString();
      return {
        startsAt,
        endsAt,
        localDate: getLocalDayFromInstant({
          instant: startsAt,
          timezone: options.timezone,
        }),
      };
    })
    .filter((interval) => {
      return (
        interval.localDate >= options.bounds.firstLocalDate &&
        interval.localDate <= options.bounds.lastLocalDate
      );
    });
}

/** Splits ninety local dates into disjoint UTC intervals with date labels. */
export function getPresenceLocalDayIntervalsFromWindow(
  options: Readonly<{ now: string; timezone: string }>,
): PresenceLocalDayInterval[] {
  const bounds = _getBoundsFromWindow(options);
  const samples = _getOffsetSamplesFromBounds({
    bounds,
    timezone: options.timezone,
  });
  const offsetBoundaries = _getOffsetBoundariesFromSamples({
    samples,
    bounds,
    timezone: options.timezone,
  });
  const midnights = _getMidnightsFromOffsetBoundaries({
    boundaries: offsetBoundaries,
    timezone: options.timezone,
  });
  const boundaries = [...new Set([...offsetBoundaries, ...midnights])].sort(
    (firstMillis, secondMillis) => {
      return firstMillis - secondMillis;
    },
  );
  return _getLocalDayIntervalsFromBoundaries({
    boundaries,
    bounds,
    timezone: options.timezone,
  });
}
