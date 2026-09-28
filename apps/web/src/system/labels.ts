import dayjs from "dayjs";
import type { MilestoneRef, VisibilitySummary } from "@memory-shoebox/shared";

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

/** m:ss, which is what a family video is measured in. */
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

/** Largest first, so an hour-old comment does not read "60 minutes ago". */
const ELAPSED_UNITS: ReadonlyArray<{
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
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
 * @param now Injectable so a test is not a function of the wall clock.
 */
export function agoLabel(timestamp: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(timestamp).getTime();
  const largestUnit = ELAPSED_UNITS.find((candidate) => {
    return elapsedMs >= candidate.ms;
  });
  if (largestUnit === undefined) {
    return "just now";
  }
  return RELATIVE_TIME.format(
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
 * The span in words, dropping whatever the two ends already share: within one
 * month it reads "9 to 13 September 2026", across months "28 September to 2
 * October 2026", and a one-day occasion is simply its date.
 */
export function milestoneDatesLabel(milestone: MilestoneRef): string {
  const start = dayjs(milestone.startsOn);
  const end = dayjs(milestone.endsOn);

  if (!isMultiDayMilestone(milestone)) {
    return dayLabel(milestone.startsOn);
  }
  if (start.year() !== end.year()) {
    return `${start.format("D MMMM YYYY")} to ${end.format("D MMMM YYYY")}`;
  }
  if (start.month() !== end.month()) {
    return `${start.format("D MMMM")} to ${end.format("D MMMM YYYY")}`;
  }
  return `${start.format("D")} to ${end.format("D MMMM YYYY")}`;
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
