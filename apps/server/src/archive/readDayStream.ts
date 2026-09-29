import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getUnionDaysFromMilestones,
  getWindowFloorFromItemDays,
  makeDayPageFromCandidates,
  makeMergedDays,
} from "./mergeDaysHelpers.ts";
import { readItemDays, type CandidateDay } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import {
  hasContentFilter,
  type TimelineFilter,
} from "./selectionFilterHelpers.ts";

/** One page of days, and the occasions that might cover them. */
export type DayStreamPage = {
  days: CandidateDay[];
  /** Every occasion overlapping the window, for the bands and the strips. */
  milestones: MilestoneRef[];
  hasMore: boolean;
};

/**
 * The occasions covering the window, and which of their days the union
 * contributes.
 *
 * Split out of {@link readDayStream} because it is one self-contained
 * decision (read the milestones, then decide their union under Ruling 1)
 * rather than a step in the page's own assembly.
 */
async function _readMilestoneDays(options: {
  database: DatabaseExecutor;
  filter: Readonly<TimelineFilter>;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
}): Promise<{ milestones: MilestoneRef[]; milestoneDays: string[] }> {
  const milestones = await readOverlappingMilestones({
    database: options.database,
    fromDay: options.filter.from,
    untilDay: options.filter.until,
    beforeDay: options.beforeDay,
    sinceDay: options.sinceDay,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones,
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: options.beforeDay,
        sinceDay: options.sinceDay,
      });

  return { milestones, milestoneDays };
}

/**
 * Queries 1 and 2, merged and cut into the days one page returns.
 *
 * **The milestone query's window is bounded by
 * {@link getWindowFloorFromItemDays}.** Without a floor, every occasion at or
 * below the cursor is fetched, which is tens of rows.
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

  const sinceDay = getWindowFloorFromItemDays({
    itemDays,
    limit: options.limit,
  });

  const { milestones, milestoneDays } = await _readMilestoneDays({
    database: options.database,
    filter: options.filter,
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
