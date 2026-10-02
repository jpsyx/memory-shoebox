import dayjs from "dayjs";
import type {
  BurstSummary,
  MilestoneRef,
  VisibilitySummary,
} from "@memory-shoebox/shared";

/**
 * Every string a reader sees that is derived from a number or a date.
 *
 * `conventions.md` § Field naming forbids a formatted or a relative date in
 * any payload: the server sends the timestamp and the browser says when. This
 * module is that browser, in one place so the same fact is not worded two ways
 * on two surfaces.
 *
 * Dates carry no time zone conversion. A `YYYY-MM-DD` from the contract is
 * already local to `shoebox.timezone`, and `PRODUCT.md` § Non-goals settles
 * that months are English for one instance rather than per reader.
 */

/**
 * m:ss, which is what a family video is measured in.
 *
 * A negative reads "0:00" rather than throwing. Every caller today is a
 * duration the contract already validates as non-negative, and a transport
 * that has scrubbed a few milliseconds past zero should show a clock rather
 * than take the page down.
 */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The runtime chip over a video's print, from the contract's milliseconds. */
export function runtimeLabel(durationMs: number): string {
  return clockLabel(durationMs / 1000);
}

/** One `YYYY-MM-DD` as a person would say it. */
export function dayLabel(capturedOn: string): string {
  return dayjs(capturedOn).format("D MMMM YYYY");
}

/** The day figure in the spine, on its own. */
export function dayNumberLabel(capturedOn: string): string {
  return dayjs(capturedOn).format("D");
}

/** The month beside it. `.label` upper-cases it in CSS, not here. */
export function monthLabel(capturedOn: string): string {
  return dayjs(capturedOn).format("MMMM");
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en-GB", {
  numeric: "auto",
});

/**
 * Largest first, so an hour-old comment does not read "60 minutes ago".
 *
 * A month is a year's twelfth rather than a round 30 days. At 30 the buckets
 * do not meet: 360 to 364 days divides into twelve months while still falling
 * short of a year, so something a few days short of a year reads "12 months
 * ago" instead of "last year".
 */
const ELAPSED_UNITS: ReadonlyArray<{
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: (365 / 12) * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

/**
 * "3 days ago", from an ISO timestamp.
 *
 * `numeric: "auto"` is what turns one day into "yesterday", which is how
 * somebody would actually say it.
 *
 * @param options.timestamp The ISO timestamp to measure from.
 * @param options.now Injectable so a test is not a function of the wall
 *   clock.
 */
export function agoLabel(options: { timestamp: string; now?: Date }): string {
  const now = options.now ?? new Date();
  const elapsedMs = now.getTime() - new Date(options.timestamp).getTime();
  const largestUnit = ELAPSED_UNITS.find((candidate) => {
    return elapsedMs >= candidate.ms;
  });
  return largestUnit === undefined
    ? "just now"
    : RELATIVE_TIME.format(
        -Math.floor(elapsedMs / largestUnit.ms),
        largestUnit.unit,
      );
}

/**
 * A milestone is a span, inclusive at both ends, and a one-day occasion is a
 * span whose ends are equal. Keeping one shape means no surface branches on
 * "is this the kind with one date", and the only place the difference shows is
 * in how the span is worded.
 */
export function isMultiDayMilestone(milestone: MilestoneRef): boolean {
  return milestone.startsOn !== milestone.endsOn;
}

/** How many days the occasion covers, counting both ends. */
export function milestoneDayCount(milestone: MilestoneRef): number {
  return dayjs(milestone.endsOn).diff(dayjs(milestone.startsOn), "day") + 1;
}

/** Every date in the span, in order, as ISO strings. */
export function milestoneDays(milestone: MilestoneRef): readonly string[] {
  return Array.from(
    { length: milestoneDayCount(milestone) },
    (_unused, index) => {
      return dayjs(milestone.startsOn).add(index, "day").format("YYYY-MM-DD");
    },
  );
}

/**
 * A stretch of time in words, dropping whatever the two ends already share:
 * within one month it reads "9 to 13 September 2026", across months
 * "28 September to 2 October 2026", and a range of one day is simply that
 * day.
 *
 * Saying the month and the year once is not only shorter. A filter chip
 * carrying "1 September 2026 to 30 September 2026" says one decision three
 * times and is nearly the width of a phone on its own.
 */
export function dateRangeLabel(range: { from: string; until: string }): string {
  const start = dayjs(range.from);
  const end = dayjs(range.until);

  return range.from === range.until
    ? dayLabel(range.from)
    : start.year() !== end.year()
      ? `${start.format("D MMMM YYYY")} to ${end.format("D MMMM YYYY")}`
      : start.month() !== end.month()
        ? `${start.format("D MMMM")} to ${end.format("D MMMM YYYY")}`
        : `${start.format("D")} to ${end.format("D MMMM YYYY")}`;
}

/** The occasion's span, in the words above. */
export function milestoneDatesLabel(milestone: MilestoneRef): string {
  return dateRangeLabel({
    from: milestone.startsOn,
    until: milestone.endsOn,
  });
}

/**
 * How a visibility rule reads once it is set, in one line.
 *
 * The server composes `label` from the rule's subjects at read time, so it is
 * preferred wherever it exists ("Just us two" beats "Only Papá, Mamá"). The
 * fallback is the same sentence assembled from the subjects themselves.
 */
export function visibilityLabel(visibility: VisibilitySummary): string {
  if (visibility.mode === "everyone") {
    return "Everyone";
  }
  if (visibility.label !== null) {
    return visibility.label;
  }
  const names = visibility.subjects.map((subject) => {
    return subject.displayName;
  });
  if (names.length === 0) {
    return visibility.mode === "only" ? "Nobody yet" : "Everyone";
  }
  const opening = visibility.mode === "only" ? "Only" : "Everyone except";
  return `${opening} ${names.join(", ")}`;
}

/** A capture's own day and clock time, as the camera would have shown them. */
export type WallClock = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, 24-hour. */
  time: string;
};

/**
 * The day and time a photograph was taken, on the clock where it was taken.
 *
 * The server's own rule (`items.md` § The capture date, step 2): the offset
 * the file carried when there is one, and the Shoebox's timezone when there
 * is not. Shifting by the offset and then reading in UTC is the same
 * arithmetic, done by `Intl` rather than by hand.
 *
 * @param options.capturedAt The UTC instant, as the contract carries it.
 * @param options.offsetMinutes `capturedAtOffsetMinutes`, or null.
 * @param options.timezone `settings.timezone`, for an offset-less capture.
 */
export function getWallClockFromCapture(options: {
  capturedAt: string;
  offsetMinutes: number | null;
  timezone: string;
}): WallClock {
  const { capturedAt, offsetMinutes, timezone } = options;
  const shifted = new Date(
    Date.parse(capturedAt) + (offsetMinutes ?? 0) * 60_000,
  );
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: offsetMinutes === null ? timezone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(shifted);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => {
    return (
      parts.find((part) => {
        return part.type === type;
      })?.value ?? "00"
    );
  };
  return {
    date: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    time: `${valueOf("hour")}:${valueOf("minute")}`,
  };
}

/** "6:41 am", from a 24-hour `HH:MM`, the way the prototypes print it. */
export function timeOfDayLabel(time: string): string {
  const [hourText = "0", minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${minuteText} ${hour < 12 ? "am" : "pm"}`;
}

/** "14 September 2026, 6:41 am". */
export function captureMomentLabel(wallClock: Readonly<WallClock>): string {
  return `${dayLabel(wallClock.date)}, ${timeOfDayLabel(wallClock.time)}`;
}

/** "14 September", for the way back to a day. */
export function dayMonthLabel(capturedOn: string): string {
  return dayjs(capturedOn).format("D MMMM");
}

/** "Frame 7 of 45". Both numbers are per viewer, from the server. */
export function framePositionLabel(options: {
  position: number;
  count: number;
}): string {
  return `Frame ${options.position} of ${options.count}`;
}

/**
 * "45 frames over 3 minutes": how long the run took, read off its visible
 * ends, which `BurstSummary` computes per viewer for exactly this reason.
 */
export function burstSpanLabel(
  burst: Readonly<
    Pick<BurstSummary, "visibleFrameCount" | "startsAt" | "endsAt">
  >,
): string {
  const seconds = Math.round(
    (Date.parse(burst.endsAt) - Date.parse(burst.startsAt)) / 1000,
  );
  const minutes = Math.round(seconds / 60);
  const span =
    seconds <= 1
      ? "in a second"
      : seconds < 60
        ? `over ${seconds} seconds`
        : minutes === 1
          ? "over a minute"
          : `over ${minutes} minutes`;
  return `${burst.visibleFrameCount} frames ${span}`;
}
