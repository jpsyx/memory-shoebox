import type { MilestoneRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getUnionDaysFromMilestones,
  getWindowBoundaryFromItemDays,
  makeDayPageFromCandidates,
  makeMergedDaysFromItemAndMilestoneDays,
} from "./mergeDaysHelpers.ts";
import { readItemDays, type CandidateDay } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import {
  hasContentFilter,
  type TimelineFilter,
} from "./selectionFilterHelpers.ts";
type MilestoneDaysOptions = {
  database: DatabaseExecutor;
  filter: Readonly<TimelineFilter>;
  beforeDay: string | undefined;
  sinceDay: string | undefined;
  afterDay: string | undefined;
  throughDay: string | undefined;
};

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
 */
async function _readMilestoneDays(
  options: MilestoneDaysOptions,
): Promise<{ milestones: MilestoneRef[]; milestoneDays: string[] }> {
  const milestones = await readOverlappingMilestones({
    database: options.database,
    fromDay: options.filter.from,
    untilDay: options.filter.until,
    beforeDay: options.beforeDay,
    sinceDay: options.sinceDay,
    afterDay: options.afterDay,
    throughDay: options.throughDay,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones,
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: options.beforeDay,
        sinceDay: options.sinceDay,
        afterDay: options.afterDay,
        throughDay: options.throughDay,
      });

  return { milestones, milestoneDays };
}

/** Visibility, filtering, cursor and resource limits for a day-stream page. */
type DayStreamOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  limit: number;
  boundaryDay: string | undefined;
  direction: "older" | "newer";
  itemBudget: number;
};

/**
 * Candidate days in the requested traversal order, before the atomic budget.
 */
async function _readDayStreamCandidates(
  options: Readonly<DayStreamOptions>,
): Promise<{ milestones: MilestoneRef[]; candidates: CandidateDay[] }> {
  const beforeDay =
    options.direction === "older" ? options.boundaryDay : undefined;
  const afterDay =
    options.direction === "newer" ? options.boundaryDay : undefined;
  const itemDays = await readItemDays({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
    beforeDay,
    afterDay,
    direction: options.direction,
    limit: options.limit + 1,
  });

  const windowEdge = getWindowBoundaryFromItemDays({
    itemDays,
    limit: options.limit,
  });

  const { milestones, milestoneDays } = await _readMilestoneDays({
    database: options.database,
    filter: options.filter,
    beforeDay,
    afterDay,
    sinceDay: options.direction === "older" ? windowEdge : undefined,
    throughDay: options.direction === "newer" ? windowEdge : undefined,
  });

  return {
    milestones,
    candidates: makeMergedDaysFromItemAndMilestoneDays({
      itemDays,
      milestoneDays,
      direction: options.direction,
    }),
  };
}

/**
 * Returns newest-first days within the page budgets and overlapping occasions.
 *
 * Occasion-only days participate only without a content filter. Occasions
 * still accompany matching item days when a content filter is active.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.limit Days per page.
 * @param options.boundaryDay The cursor's day, exclusive.
 * @param options.direction Older or newer days nearest the boundary.
 * @param options.itemBudget The configured timeline page-item budget.
 */
export async function readDayStream(
  options: Readonly<DayStreamOptions>,
): Promise<DayStreamPage> {
  const { milestones, candidates } = await _readDayStreamCandidates(options);
  const page = makeDayPageFromCandidates({
    candidates,
    limit: options.limit,
    itemBudget: options.itemBudget,
  });

  const days =
    options.direction === "newer" ? page.days.toReversed() : page.days;
  return { days, milestones, hasMore: page.hasMore };
}
