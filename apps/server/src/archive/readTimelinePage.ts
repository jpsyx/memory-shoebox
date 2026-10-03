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
  rankMilestonesForDay,
} from "./milestoneSpanHelpers.ts";
import { readDayStream } from "./readDayStream.ts";
import type { CandidateDay } from "./readItemDays.ts";
import { readItemSummariesByDay } from "./readItemSummariesByDay.ts";
import { readMilestoneItemCounts } from "./readMilestoneItemCounts.ts";
import { hasAnyFilter, type TimelineFilter } from "./selectionFilterHelpers.ts";
import {
  makeDigestFromFilter,
  makeOpenedIdsFromPage,
  makeTimelineCursorFromPageState,
  type TimelinePageState,
} from "./timelineCursorHelpers.ts";

/** One day, once it is known which occasion takes its band. */
type BandedDay = {
  day: CandidateDay;
  band: MilestoneRef | undefined;
  strips: MilestoneRef[];
};

/** `banded`: the days decided so far. `opened`: occasions already banded. */
type BandWalkState = {
  banded: BandedDay[];
  opened: string[];
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

/**
 * Walks the page newest day first, carrying what has taken a band.
 *
 * The band rule is feed-ordered, so this cannot be done per day in isolation:
 * an occasion that opened on the 17th is a continuation strip on the 16th, and
 * the set it is carried in arrives from the cursor on every page but the first.
 */
function _makeBandedDays(options: {
  days: readonly CandidateDay[];
  milestones: readonly MilestoneRef[];
  openedMilestoneIds: readonly string[];
}): BandedDay[] {
  return options.days.reduce<BandWalkState>(
    (state, day) => {
      const ranked = rankMilestonesForDay({
        milestones: options.milestones,
        day: day.capturedOn,
        openedMilestoneIds: state.opened,
      });
      return {
        banded: [
          ...state.banded,
          { day, band: ranked.band, strips: ranked.strips },
        ],
        opened:
          ranked.band === undefined
            ? state.opened
            : [...state.opened, ranked.band.milestoneId],
      };
    },
    { banded: [], opened: [...options.openedMilestoneIds] },
  ).banded;
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
  stream: { hasMore: boolean; milestones: readonly MilestoneRef[] };
  bandedDays: readonly BandedDay[];
}): string | null {
  const lastDay =
    options.bandedDays[options.bandedDays.length - 1]?.day.capturedOn;
  if (!options.stream.hasMore || lastDay === undefined) {
    return null;
  }

  return makeTimelineCursorFromPageState({
    lastDay,
    openedMilestoneIds: makeOpenedIdsFromPage({
      previousOpenedIds: options.pageOptions.cursor?.openedMilestoneIds ?? [],
      bandedIds: options.bandedDays.flatMap((banded) => {
        return banded.band === undefined ? [] : [banded.band.milestoneId];
      }),
      milestones: options.stream.milestones,
      lastDay,
    }),
    filterDigest: makeDigestFromFilter(options.pageOptions.filter),
  });
}

/**
 * One page of the pile: days, their counts, their occasions and their prints.
 *
 * It runs no query of its own. Every read is one of the modules beside it, and
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

  const bandedDays = _makeBandedDays({
    days: stream.days,
    milestones: stream.milestones,
    openedMilestoneIds: options.cursor?.openedMilestoneIds ?? [],
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
