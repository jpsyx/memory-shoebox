import type { RailDay } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getUnionDaysFromMilestones,
  makeMergedDays,
} from "./mergeDaysHelpers.ts";
import { readItemDays } from "./readItemDays.ts";
import { readOverlappingMilestones } from "./readOverlappingMilestones.ts";
import {
  hasContentFilter,
  type TimelineFilter,
} from "./selectionFilterHelpers.ts";

/**
 * Every visible day with its count, complete and unpaginated.
 *
 * The same day stream as the timeline, same union rule, same counts, without
 * the items. A milestone-only day appears at `itemCount: 0` and is jumpable,
 * which is the point of it being here.
 *
 * **The first query in the product that will hurt**
 * (`data-models.md` § The queries that will hurt first): a covering scan of
 * roughly 50,000 index entries on `(captured_on DESC, visibility_rule_id, id)`
 * plus the milestone expansion, unbounded in day count. It is the first thing
 * to cache, per `(memberId, visibilityGeneration)` plus an item-generation
 * counter, and it is deliberately not cached yet: nothing writes an item yet,
 * so there is no generation counter to invalidate on, and a cache without one
 * goes stale on the first upload and stays stale.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The same selection the pile under it carries.
 */
export async function readRailDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<RailDay[]> {
  const itemDays = await readItemDays({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
  });

  const milestoneDays = hasContentFilter(options.filter)
    ? []
    : getUnionDaysFromMilestones({
        milestones: await readOverlappingMilestones({
          database: options.database,
          fromDay: options.filter.from,
          untilDay: options.filter.until,
          beforeDay: undefined,
          sinceDay: undefined,
        }),
        fromDay: options.filter.from,
        untilDay: options.filter.until,
        beforeDay: undefined,
        sinceDay: undefined,
      });

  return makeMergedDays({ itemDays, milestoneDays }).map((day) => {
    return { capturedOn: day.capturedOn, itemCount: day.itemCount };
  });
}
