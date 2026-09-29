import type { MilestoneRef } from "@memory-shoebox/shared";

/**
 * A milestone is a span, and everything the timeline says about one comes from
 * here.
 *
 * `ends_on` is inclusive and equals `starts_on` for a one-day occasion, never
 * null, and that one shape **is** the span model: nothing downstream branches
 * on "the kind with one date".
 *
 * The arithmetic is UTC midnights rather than a date library, which is exact
 * because these are calendar dates with no zone of their own:
 * `shoebox.timezone` decided which day a photograph landed on at write time,
 * and a span is compared to the `captured_on` that resulted.
 */

const MILLISECONDS_PER_DAY = 86_400_000;

/** One `YYYY-MM-DD` as a UTC midnight. */
function _getTimeFromDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** One UTC midnight back as `YYYY-MM-DD`. */
function _getDayFromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** How many days the occasion covers, counting both ends. */
export function getDayCountFromMilestone(
  milestone: Readonly<MilestoneRef>,
): number {
  return (
    Math.round(
      (_getTimeFromDay(milestone.endsOn) -
        _getTimeFromDay(milestone.startsOn)) /
        MILLISECONDS_PER_DAY,
    ) + 1
  );
}

/** Every date in the span, in order. */
export function getDaysFromMilestone(
  milestone: Readonly<MilestoneRef>,
): string[] {
  const startsAt = _getTimeFromDay(milestone.startsOn);
  return Array.from(
    { length: getDayCountFromMilestone(milestone) },
    (_unused, index) => {
      return _getDayFromTime(startsAt + index * MILLISECONDS_PER_DAY);
    },
  );
}

/**
 * Which day of the occasion a date is, counting from one. `0` if the day
 * falls outside the span.
 *
 * Callers only ever pass a day the occasion covers, and the one caller in the
 * product gets it from `rankMilestonesForDay`. `0` is a deliberately
 * impossible position anyway, so the response schema's
 * `dayPosition: z.number().int().positive()` turns any future misuse into a
 * loud validation failure rather than a plausible-looking negative sitting in
 * a payload.
 */
export function getDayPositionFromMilestone(options: {
  milestone: Readonly<MilestoneRef>;
  day: string;
}): number {
  const isOutsideSpan =
    options.day < options.milestone.startsOn ||
    options.day > options.milestone.endsOn;
  if (isOutsideSpan) {
    return 0;
  }
  return (
    Math.round(
      (_getTimeFromDay(options.day) -
        _getTimeFromDay(options.milestone.startsOn)) /
        MILLISECONDS_PER_DAY,
    ) + 1
  );
}

/**
 * Which occasion takes this day's one full band, and which continue as strips.
 *
 * A day covered by two occasions still gets one headline. **The narrowest span
 * wins it**, because the narrower thing is the more specific thing to say
 * about that day: the 17th is the day they came home, and it is also the first
 * of five quiet days at home, and the first of those is the news. Ties break by
 * earliest start, so the rule is total and the wall does not reshuffle between
 * visits (Decision 14).
 *
 * `openedMilestoneIds` wins over all of it: an occasion whose band opened on a
 * day further up the feed never opens a second one. What counts as opened is
 * what **took a band**, never merely what appeared, so an occasion that has
 * only ever been a strip still gets its full band on the next day it wins one.
 *
 * The feed runs newest first, so "the first of its days you meet" is a
 * multi-day occasion's **last** date: the band opens there and the strips
 * descend with it. This reproduces `prototypes/src/data/milestones.ts`
 * `rankMilestonesForDay` exactly, and the client draws what it is given.
 *
 * @param options.milestones Every occasion known to this page.
 * @param options.day The `captured_on` being ranked.
 * @param options.openedMilestoneIds What has already taken a band.
 */
export function rankMilestonesForDay(options: {
  milestones: readonly MilestoneRef[];
  day: string;
  openedMilestoneIds: readonly string[];
}): { band: MilestoneRef | undefined; strips: MilestoneRef[] } {
  const covering = options.milestones
    .filter((milestone) => {
      return (
        milestone.startsOn <= options.day && milestone.endsOn >= options.day
      );
    })
    .sort((left, right) => {
      return left.startsOn.localeCompare(right.startsOn);
    });

  const openable = covering.filter((milestone) => {
    return !options.openedMilestoneIds.includes(milestone.milestoneId);
  });

  const [band] = openable.sort((left, right) => {
    const byWidth =
      getDayCountFromMilestone(left) - getDayCountFromMilestone(right);
    // A true tie (equal width, equal start) resolves to input order: the
    // sort is stable and `openable` is already ordered by start date.
    return byWidth === 0
      ? left.startsOn.localeCompare(right.startsOn)
      : byWidth;
  });

  return {
    band,
    strips: covering.filter((milestone) => {
      return milestone.milestoneId !== band?.milestoneId;
    }),
  };
}
