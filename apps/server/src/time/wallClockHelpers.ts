import { makeFormatterCacheByZone } from "./makeFormatterCacheByZone.ts";

/**
 * The wall clock a zone was showing at an instant, as `HH:MM:SS`.
 *
 * `en-GB` with `hourCycle: "h23"` so that midnight is `00`, which `hour12:
 * false` alone does not guarantee across runtimes.
 */
const _clockFormatterFor = makeFormatterCacheByZone((timezone) => {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

/** The offset a zone was at, in minutes, as `GMT+02:00` parsed. */
const _offsetFormatterFor = makeFormatterCacheByZone((timezone) => {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
});

/** The zone's offset from UTC at that instant, in minutes. */
function _getOffsetMinutesAt(options: {
  instant: Date;
  timezone: string;
}): number {
  const part = _offsetFormatterFor(options.timezone)
    .formatToParts(options.instant)
    .find((entry) => {
      return entry.type === "timeZoneName";
    });
  const matched = /GMT(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2})/u.exec(
    part?.value ?? "",
  );
  if (matched?.groups === undefined) {
    // `longOffset` renders UTC itself as "GMT", with nothing to parse.
    return 0;
  }
  const magnitude =
    Number(matched.groups.hours) * 60 + Number(matched.groups.minutes);
  return matched.groups.sign === "-" ? -magnitude : magnitude;
}

/** `HH:MM` padded to `HH:MM:SS`. */
function _padToSeconds(localTime: string): string {
  return localTime.length === 5 ? `${localTime}:00` : localTime;
}

/**
 * The wall clock an item's `captured_at` was taken at.
 *
 * **The stored offset wins when there is one**, because it is what the file
 * carried: a photograph taken at 06:41 in Madrid keeps 06:41 however the
 * Shoebox's own zone is set later. With no offset the instant resolves in
 * `shoebox.timezone`, and the null is what keeps that guess distinguishable
 * from a fact (`data-models.md` § Capture dates, Decision 10).
 *
 * @param options.instant The stored `captured_at`.
 * @param options.offsetMinutes `captured_at_offset_minutes`, usually null.
 * @param options.timezone The `shoebox.timezone` setting.
 */
export function getLocalWallClockFromInstant(options: {
  instant: string;
  offsetMinutes: number | null;
  timezone: string;
}): string {
  if (options.offsetMinutes !== null) {
    // Shift into the offset and read the clock in UTC, which is the same
    // arithmetic the file's own offset describes.
    const shifted = new Date(
      Date.parse(options.instant) + options.offsetMinutes * 60_000,
    );
    return _clockFormatterFor("UTC").format(shifted);
  }
  return _clockFormatterFor(options.timezone).format(new Date(options.instant));
}

/**
 * A local day plus a wall clock, back to the instant it names.
 *
 * With a stored offset this is arithmetic and nothing else: the file said what
 * its offset was, and moving a photograph to another day does not move the
 * camera to another country.
 *
 * Without one it resolves in `shoebox.timezone`, which needs the zone's rules
 * and therefore two measurements: format the naive instant, measure the offset
 * it landed at, correct, and **check by formatting back**. Two transitions a
 * year make that check load-bearing rather than defensive:
 *
 * - **An ambiguous wall clock**, where the clocks went back and 02:30 happened
 *   twice, resolves to **the occurrence whose offset the naive instant reads
 *   at**, which the first correction lands on. That is the later,
 *   standard-time occurrence in a zone ahead of UTC (02:30 CET in
 *   `Europe/Madrid`) and the earlier, daylight-time one in a zone behind it
 *   (01:30 EDT in `America/New_York`), because the naive instant sits after
 *   the transition in the first case and before it in the second. Both are
 *   real instants that read back as the requested clock, so either answer is
 *   defensible; the rule is stated by the sign rather than by "standard time"
 *   because that is what the arithmetic actually does, and both zones are
 *   pinned by a test.
 * - **A nonexistent wall clock**, where the clocks went forward and 02:30
 *   never happened, is **shifted forward by the size of the gap**, which is
 *   what the later of the two candidates is. That holds whichever side of
 *   UTC the zone is on.
 *
 * @param options.localDate `YYYY-MM-DD`, local.
 * @param options.localTime `HH:MM` or `HH:MM:SS`, local.
 * @param options.offsetMinutes The item's own offset, or null.
 * @param options.timezone The `shoebox.timezone` setting.
 * @returns An ISO-8601 UTC instant with milliseconds.
 */
export function makeInstantFromLocalWallClock(options: {
  localDate: string;
  localTime: string;
  offsetMinutes: number | null;
  timezone: string;
}): string {
  const naive = Date.parse(
    `${options.localDate}T${_padToSeconds(options.localTime)}Z`,
  );

  if (options.offsetMinutes !== null) {
    return new Date(naive - options.offsetMinutes * 60_000).toISOString();
  }

  const wanted = _padToSeconds(options.localTime);
  const isWanted = (candidate: number): boolean => {
    return (
      _clockFormatterFor(options.timezone).format(new Date(candidate)) ===
      wanted
    );
  };

  const first =
    naive -
    _getOffsetMinutesAt({
      instant: new Date(naive),
      timezone: options.timezone,
    }) *
      60_000;
  if (isWanted(first)) {
    return new Date(first).toISOString();
  }

  const second =
    naive -
    _getOffsetMinutesAt({
      instant: new Date(first),
      timezone: options.timezone,
    }) *
      60_000;
  if (isWanted(second)) {
    return new Date(second).toISOString();
  }

  // Neither reads back as the requested clock, so it fell in the gap: the
  // later candidate is the requested time shifted forward by the gap.
  return new Date(Math.max(first, second)).toISOString();
}
