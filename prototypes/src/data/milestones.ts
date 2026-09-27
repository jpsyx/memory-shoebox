import dayjs from "dayjs";
import type { Milestone } from "@/data/fixtures";

/**
 * Everything derived from a milestone's span.
 *
 * A milestone is a range of dates, inclusive at both ends, and a one-day
 * occasion is a range whose ends are equal. Keeping that single shape means
 * no surface has to branch on "is this the kind with one date", and the only
 * place the difference shows up is in how the span is worded.
 */

export function isMultiDayMilestone(milestone: Milestone): boolean {
  return milestone.startsOn !== milestone.endsOn;
}

/** How many days the occasion covers, counting both ends. */
export function milestoneDayCount(milestone: Milestone): number {
  return dayjs(milestone.endsOn).diff(dayjs(milestone.startsOn), "day") + 1;
}

/** Every date in the span, in order, as ISO strings. */
export function milestoneDays(milestone: Milestone): readonly string[] {
  return Array.from(
    { length: milestoneDayCount(milestone) },
    (_unused, index) => {
      return dayjs(milestone.startsOn).add(index, "day").format("YYYY-MM-DD");
    },
  );
}

/** Which day of the occasion a date is, counting from one. Zero if outside. */
export function milestoneDayPosition(
  milestone: Milestone,
  date: string,
): number {
  if (!isWithinMilestone(milestone, date)) {
    return 0;
  }
  return dayjs(date).diff(dayjs(milestone.startsOn), "day") + 1;
}

export function isWithinMilestone(milestone: Milestone, date: string): boolean {
  const day = dayjs(date);
  return (
    !day.isBefore(dayjs(milestone.startsOn), "day") &&
    !day.isAfter(dayjs(milestone.endsOn), "day")
  );
}

/** One ISO date as a person would say it. */
export function formatDay(date: string): string {
  return dayjs(date).format("D MMMM YYYY");
}

/**
 * The span in words, dropping whatever the two ends already share: within one
 * month it reads "9 to 13 September 2026", across months "28 September to 2
 * October 2026", and a one-day occasion is simply its date.
 */
export function describeMilestoneDates(milestone: Milestone): string {
  const start = dayjs(milestone.startsOn);
  const end = dayjs(milestone.endsOn);

  if (!isMultiDayMilestone(milestone)) {
    return formatDay(milestone.startsOn);
  }
  if (start.year() !== end.year()) {
    return `${start.format("D MMMM YYYY")} to ${end.format("D MMMM YYYY")}`;
  }
  if (start.month() !== end.month()) {
    return `${start.format("D MMMM")} to ${end.format("D MMMM YYYY")}`;
  }
  return `${start.format("D")} to ${end.format("D MMMM YYYY")}`;
}

/** The span plus how long it ran, for the places that carry both. */
export function describeMilestoneSpan(milestone: Milestone): string {
  const dates = describeMilestoneDates(milestone);
  if (!isMultiDayMilestone(milestone)) {
    return dates;
  }
  return `${dates} · ${milestoneDayCount(milestone)} days`;
}

/** Every occasion whose span covers this date, earliest-starting first. */
export function milestonesForDay(
  milestones: readonly Milestone[],
  date: string,
): readonly Milestone[] {
  return milestones
    .filter((milestone) => {
      return isWithinMilestone(milestone, date);
    })
    .sort((left, right) => {
      return left.startsOn.localeCompare(right.startsOn);
    });
}

/** The widest span that still covers every date given, as a milestone would. */
export function spanOf(dates: readonly string[]): {
  readonly startsOn: string;
  readonly endsOn: string;
} {
  const sorted = [...dates].sort();
  const first = sorted[0] ?? dayjs().format("YYYY-MM-DD");
  const last = sorted[sorted.length - 1] ?? first;
  return { startsOn: first, endsOn: last };
}

/**
 * Which occasion gets the day's band, and which are continuation strips.
 *
 * A day covered by two occasions still gets one headline. The narrowest span
 * wins it, because the narrower thing is the more specific thing to say about
 * that day: the 17th is the day they came home, and it is also the first of
 * five quiet days at home, and the first of those is the news.
 *
 * Ties break by earliest start, so the rule is total and the wall does not
 * reshuffle between visits.
 *
 * `alreadyOpened` still wins over all of it: an occasion whose band opened on
 * a day further up the feed never opens a second one.
 */
export function rankMilestonesForDay(
  milestones: readonly Milestone[],
  date: string,
  alreadyOpened: readonly string[] = [],
): {
  readonly band: Milestone | undefined;
  readonly continues: readonly Milestone[];
} {
  const covering = milestonesForDay(milestones, date);
  const openable = covering.filter((milestone) => {
    return !alreadyOpened.includes(milestone.id);
  });

  const band = [...openable].sort((left, right) => {
    const byWidth = milestoneDayCount(left) - milestoneDayCount(right);
    return byWidth === 0
      ? left.startsOn.localeCompare(right.startsOn)
      : byWidth;
  })[0];

  return {
    band,
    continues: covering.filter((milestone) => {
      return milestone.id !== band?.id;
    }),
  };
}
