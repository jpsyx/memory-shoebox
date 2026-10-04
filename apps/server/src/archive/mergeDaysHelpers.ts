import type { MilestoneRef } from "@memory-shoebox/shared";
import { getDaysFromMilestone } from "./milestoneSpanHelpers/milestoneSpanHelpers.ts";
import type { CandidateDay } from "./readItemDays.ts";

/**
 * The days a milestone span contributes, clipped to the page's window.
 *
 * A milestone day with no items still appears and still has a date to be a
 * cursor, which is the whole reason the day stream is a union rather than a
 * group-by (`data-models.md` § `items`).
 *
 * @param options.milestones The occasions covering the window.
 * @param options.fromDay The selection's inclusive lower date, if any.
 * @param options.untilDay The selection's inclusive upper date, if any.
 * @param options.beforeDay The cursor's day, exclusive.
 * @param options.sinceDay The window's floor, inclusive.
 */
export function getUnionDaysFromMilestones(options: {
  milestones: readonly MilestoneRef[];
  fromDay: string | undefined;
  untilDay: string | undefined;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
}): string[] {
  const days = options.milestones.flatMap((milestone) => {
    return getDaysFromMilestone(milestone);
  });
  return [...new Set(days)].filter((day) => {
    return (
      (options.fromDay === undefined || day >= options.fromDay) &&
      (options.untilDay === undefined || day <= options.untilDay) &&
      (options.beforeDay === undefined || day < options.beforeDay) &&
      (options.sinceDay === undefined || day >= options.sinceDay)
    );
  });
}

/**
 * The floor that bounds the milestone query, and the bound is provable.
 *
 * Item days are read with `limit + 1`; if a `(limit + 1)`-th day comes back,
 * no date below it can reach this page, because every such date already has
 * at least `limit + 1` item days above it in the merged descending order.
 * With fewer than that there are no more item days at all, so there is no
 * floor.
 *
 * The index is only reached once the length check has already proven it is
 * in range, so a miss there is a bug worth a thrown error, not a silent
 * `undefined`.
 *
 * @param options.itemDays The item days, read with `limit + 1`.
 * @param options.limit Days per page.
 */
export function getWindowFloorFromItemDays(options: {
  itemDays: readonly CandidateDay[];
  limit: number;
}): string | undefined {
  return options.itemDays.length > options.limit
    ? options.itemDays[options.limit]!.capturedOn
    : undefined;
}

/**
 * The union: item days and milestone days as one descending stream.
 *
 * A date that has both keeps its counts. A date that has only an occasion
 * arrives at `itemCount: 0`, which is surface 2's `milestone-empty` state and
 * is still jumpable from the rail.
 *
 * @param options.itemDays The days with items, from query 1.
 * @param options.milestoneDays The days a covering occasion contributes.
 */
export function makeMergedDays(options: {
  itemDays: readonly CandidateDay[];
  milestoneDays: readonly string[];
}): CandidateDay[] {
  const itemDates = new Set(
    options.itemDays.map((day) => {
      return day.capturedOn;
    }),
  );
  return [
    ...options.itemDays,
    ...options.milestoneDays
      .filter((day) => {
        return !itemDates.has(day);
      })
      .map((day) => {
        return { capturedOn: day, itemCount: 0, unseenCount: 0 };
      }),
  ].sort((left, right) => {
    return right.capturedOn.localeCompare(left.capturedOn);
  });
}

/**
 * Cuts the merged stream into one page.
 *
 * **A day is atomic**: `limit` counts days and a day never splits across
 * pages, so the next page is `captured_on < :d` strictly. The pile has no
 * in-day pagination affordance, and inventing one here would be a design
 * change made in an API document.
 *
 * The guard against a very fat day is a soft budget rather than a hard cut:
 * the day that passes it is included and is the last, and a page always
 * carries at least one day however large it is.
 *
 * @param options.candidates The merged stream, newest first.
 * @param options.limit Days per page.
 * @param options.itemBudget `appConfig.timeline.pageItemBudget`.
 */
export function makeDayPageFromCandidates(options: {
  candidates: readonly CandidateDay[];
  limit: number;
  itemBudget: number;
}): { days: CandidateDay[]; hasMore: boolean } {
  const taken = options.candidates.reduce<{
    days: CandidateDay[];
    items: number;
  }>(
    (page, day) => {
      const isFull =
        page.days.length >= options.limit ||
        (page.days.length > 0 && page.items > options.itemBudget);
      return isFull
        ? page
        : { days: [...page.days, day], items: page.items + day.itemCount };
    },
    { days: [], items: 0 },
  );

  return {
    days: taken.days,
    hasMore: options.candidates.length > taken.days.length,
  };
}
