import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getUnionDaysFromMilestones,
  makeDayPageFromCandidates,
  makeMergedDays,
} from "./mergeDays.ts";
import { readItemDays, type CandidateDay } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import { hasContentFilter, type TimelineFilter } from "./selectionFilter.ts";

/** One page of days, and the occasions that might cover them. */
export type DayStreamPage = {
  days: CandidateDay[];
  /** Every occasion overlapping the window, for the bands and the strips. */
  milestones: MilestoneRef[];
  hasMore: boolean;
};

/**
 * Queries 1 and 2, merged and cut into the days one page returns.
 *
 * **The milestone query's window is bounded, and the bound is provable.** Item
 * days are read with `limit + 1`; if a `(limit + 1)`-th comes back, no date
 * below it can reach this page, because every such date already has at least
 * `limit + 1` item days above it in the merged descending order. With fewer
 * than that there are no more item days at all, so there is no floor and every
 * occasion at or below the cursor is fetched, which is tens of rows.
 *
 * **The union applies only when no content filter is set** (`timeline.md`
 * Ruling 1). The milestones themselves are still read under a content filter,
 * because a day that does survive one still carries its band.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.limit Days per page.
 * @param options.beforeDay The cursor's day, exclusive.
 * @param options.itemBudget `appConfig.timeline.pageItemBudget`.
 */
export async function readDayStream(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  limit: number;
  beforeDay: string | undefined;
  itemBudget: number;
}): Promise<DayStreamPage> {
  const itemDays = await readItemDays({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
    beforeDay: options.beforeDay,
    limit: options.limit + 1,
  });

  const sinceDay =
    itemDays.length > options.limit
      ? itemDays[options.limit]?.capturedOn
      : undefined;

  const milestones = await readOverlappingMilestones({
    database: options.database,
    fromDay: options.filter.from,
    untilDay: options.filter.until,
    beforeDay: options.beforeDay,
    sinceDay,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones,
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: options.beforeDay,
        sinceDay,
      });

  const page = makeDayPageFromCandidates({
    candidates: makeMergedDays({ itemDays, milestoneDays }),
    limit: options.limit,
    itemBudget: options.itemBudget,
  });

  return { days: page.days, milestones, hasMore: page.hasMore };
}
