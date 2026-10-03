import { getDayBandAssignmentsFromMilestoneSpans } from "../milestones/getDayBandAssignmentsFromMilestoneSpans.ts";
import type {
  ItemSummary,
  MilestoneRef,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
} from "./milestoneSpanHelpers.ts";
import { readDayStream } from "./readDayStream.ts";
import type { CandidateDay } from "./readItemDays.ts";
import { readItemSummariesByDay } from "./readItemSummariesByDay.ts";
import { readMilestoneItemCounts } from "./readMilestoneItemCounts.ts";
import { hasAnyFilter, type TimelineFilter } from "./selectionFilterHelpers.ts";
import {
  makeDigestFromFilter,
  makeTimelineCursorFromPageState,
  type TimelinePageState,
} from "./timelineCursorHelpers.ts";

/** One day, once it is known which occasion takes its band. */
type BandedDay = {
  day: CandidateDay;
  band: MilestoneRef | undefined;
  strips: MilestoneRef[];
};

/** What one page of the day stream is read with. */
export type TimelinePageOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  filter: TimelineFilter;
  limit: number;
  /** Decoded and already checked against the filter digest by the route. */
  cursor: TimelinePageState | undefined;
  /** The request's own clock, which every `expiresAt` counts from. */
  now: Date;
  /** Optional, for the one defect this route can meet and must survive. */
  logger?: { warn: (details: object, message: string) => void };
};

/** Looks up each returned day's globally assigned band and continuations. */
async function _readBandedDays(
  options: Readonly<{
    days: readonly CandidateDay[];
    database: DatabaseExecutor;
  }>,
): Promise<BandedDay[]> {
  const milestones = await options.database
    .selectFrom("milestones")
    .select([
      "id as milestoneId",
      "name",
      "starts_on as startsOn",
      "ends_on as endsOn",
      "blurb",
    ])
    .execute();
  const assignments = getDayBandAssignmentsFromMilestoneSpans(milestones);
  const milestonesById = new Map(
    milestones.map((milestone) => {
      return [milestone.milestoneId, milestone];
    }),
  );
  return options.days.map((day) => {
    const assignment = assignments.get(day.capturedOn);
    return {
      day,
      band:
        assignment?.bandMilestoneId == null
          ? undefined
          : milestonesById.get(assignment.bandMilestoneId),
      strips: (assignment?.continuesMilestoneIds ?? []).flatMap((id) => {
        const milestone = milestonesById.get(id);
        return milestone === undefined ? [] : [milestone];
      }),
    };
  });
}

/** One day, with its band resolved and its prints attached. */
function _makeTimelineDay(options: {
  banded: Readonly<BandedDay>;
  bandCounts: ReadonlyMap<string, number>;
  itemsByDay: ReadonlyMap<string, ItemSummary[]>;
}): TimelineDay {
  const { day, band, strips } = options.banded;
  return {
    capturedOn: day.capturedOn,
    itemCount: day.itemCount,
    unseenCount: day.unseenCount,
    milestoneBand:
      band === undefined
        ? null
        : {
            milestone: band,
            dayPosition: getDayPositionFromMilestone({
              milestone: band,
              day: day.capturedOn,
            }),
            dayCount: getDayCountFromMilestone(band),
            itemCount: options.bandCounts.get(band.milestoneId) ?? 0,
          },
    milestoneStrips: strips.map((milestone) => {
      return {
        milestone,
        dayPosition: getDayPositionFromMilestone({
          milestone,
          day: day.capturedOn,
        }),
        dayCount: getDayCountFromMilestone(milestone),
      };
    }),
    items: options.itemsByDay.get(day.capturedOn) ?? [],
  };
}

/** `resultCount`: computed once, only on the first page of a narrowed selection. */
async function _readResultCount(
  options: Readonly<TimelinePageOptions>,
): Promise<number | null> {
  if (!hasAnyFilter(options.filter) || options.cursor !== undefined) {
    return null;
  }
  return countSelectedItems({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
  });
}

/** The cursor for the next page, or null at the end of the archive. */
function _makeNextCursor(options: {
  pageOptions: Readonly<TimelinePageOptions>;
  stream: { hasMore: boolean };
  bandedDays: readonly BandedDay[];
}): string | null {
  const lastDay =
    options.bandedDays[options.bandedDays.length - 1]?.day.capturedOn;
  if (!options.stream.hasMore || lastDay === undefined) {
    return null;
  }

  return makeTimelineCursorFromPageState({
    lastDay,
    filterDigest: makeDigestFromFilter(options.pageOptions.filter),
  });
}

/**
 * One page of the pile: days, their counts, their occasions and their prints.
 *
 * Global ranking reads the complete small milestone catalog. Other reads use
 * the bounded day stream and batched media readers, and
 * none of them is per item, per day or per burst: the day aggregate and the
 * milestones decide the page, then everything about it is fetched in batches
 * keyed by the ids actually drawn.
 *
 * **`itemCount` is not `items.length`.** It is every visible item on the day,
 * burst frames included, because the spine's "212 photos" counts photographs
 * and a burst is a rendering collapse rather than fewer pictures.
 *
 * @param options See {@link TimelinePageOptions}.
 */
export async function readTimelinePage(
  options: Readonly<TimelinePageOptions>,
): Promise<TimelineResponse> {
  const stream = await readDayStream({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
    limit: options.limit,
    beforeDay: options.cursor?.lastDay,
    itemBudget: appConfig.timeline.pageItemBudget,
  });

  const bandedDays = await _readBandedDays({
    days: stream.days,
    database: options.database,
  });

  const itemsByDay = await readItemSummariesByDay({
    pageOptions: options,
    days: stream.days.map((day) => {
      return day.capturedOn;
    }),
  });

  const bandCounts = await readMilestoneItemCounts({
    database: options.database,
    viewer: options.viewer,
    milestoneIds: bandedDays.flatMap((banded) => {
      return banded.band === undefined ? [] : [banded.band.milestoneId];
    }),
  });

  return {
    days: bandedDays.map((banded) => {
      return _makeTimelineDay({ banded, bandCounts, itemsByDay });
    }),
    nextCursor: _makeNextCursor({ pageOptions: options, stream, bandedDays }),
    resultCount: await _readResultCount(options),
  };
}
