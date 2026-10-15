import { getDayBandAssignmentsFromMilestoneSpans } from "../milestones/getDayBandAssignmentsFromMilestoneSpans/getDayBandAssignmentsFromMilestoneSpans.ts";
import {
  expressionBuilder,
  type AliasableExpression,
  type SqlBool,
} from "kysely";
import type {
  ItemSummary,
  MilestoneRef,
  TimelineDay,
  TimelineResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
} from "./milestoneSpanHelpers/milestoneSpanHelpers.ts";
import { readDayStream } from "./readDayStream.ts";
import type { CandidateDay } from "./readItemDays.ts";
import { readItemSummariesByDay } from "./readItemSummariesByDay.ts";
import { readMilestoneItemCounts } from "./readMilestoneItemCounts.ts";
import {
  hasAnyFilter,
  hasContentFilter,
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilterHelpers.ts";
import {
  makeDigestFromFilter,
  makeTimelineCursorFromPageState,
  type TimelinePageState,
} from "./timelineCursorHelpers/timelineCursorHelpers.ts";

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
  /** Explicitly recount a retained refresh whose uncursored page was evicted. */
  includeResultCount?: boolean;
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

/** Count a narrowed selection only on bootstrap or an explicit refresh head. */
async function _readResultCount(
  options: Readonly<TimelinePageOptions>,
): Promise<number | null> {
  if (
    !hasAnyFilter(options.filter) ||
    (options.cursor !== undefined && !options.includeResultCount)
  ) {
    return null;
  }
  return countSelectedItems({
    database: options.database,
    viewer: options.viewer,
    filter: options.filter,
  });
}

/** The side of one page checked for another eligible day. */
type TimelineEdgeOptions = {
  pageOptions: Readonly<TimelinePageOptions>;
  boundaryDay: string;
  direction: "older" | "newer";
};

/** Whether the selected date window permits occasion days beyond this edge. */
function _hasMilestoneDateWindow(
  options: Readonly<TimelineEdgeOptions>,
): boolean {
  const { filter } = options.pageOptions;
  return (
    !hasContentFilter(filter) &&
    (filter.from === undefined ||
      filter.until === undefined ||
      filter.from <= filter.until) &&
    (options.direction === "older"
      ? filter.from === undefined || filter.from < options.boundaryDay
      : filter.until === undefined || filter.until > options.boundaryDay)
  );
}

/** Visible, selection-exact items on one side, without a total count. */
function _getItemDayExistenceExpression(
  options: Readonly<TimelineEdgeOptions>,
): AliasableExpression<SqlBool> {
  const { viewer, filter } = options.pageOptions;
  const expression = expressionBuilder<Database, never>();
  const items = expression
    .selectFrom("items")
    .select("items.id")
    .where(makeSelectionExpressionFromFilter({ viewer, filter }))
    .where(
      "items.captured_on",
      options.direction === "older" ? "<" : ">",
      options.boundaryDay,
    )
    .limit(1);
  return expression.exists(items);
}

/** A date-keyset probe of eligible item and occasion days on one side. */
function _getDayExistenceExpression(
  options: Readonly<TimelineEdgeOptions>,
): AliasableExpression<SqlBool> {
  const itemExists = _getItemDayExistenceExpression(options);
  if (!_hasMilestoneDateWindow(options)) {
    return itemExists;
  }
  const { filter } = options.pageOptions;
  const expression = expressionBuilder<Database, never>();
  const milestones = expression
    .selectFrom("milestones")
    .select("milestones.id")
    .where(
      options.direction === "older"
        ? "milestones.starts_on"
        : "milestones.ends_on",
      options.direction === "older" ? "<" : ">",
      options.boundaryDay,
    );
  const fromBounded =
    filter.from === undefined
      ? milestones
      : milestones.where("milestones.ends_on", ">=", filter.from);
  const untilBounded =
    filter.until === undefined
      ? fromBounded
      : fromBounded.where("milestones.starts_on", "<=", filter.until);
  return expression.or([itemExists, expression.exists(untilBounded.limit(1))]);
}

/** Both server-issued edge cursors use visibility-scoped bounded existence. */
async function _readEdgeCursors(options: {
  pageOptions: Readonly<TimelinePageOptions>;
  days: readonly CandidateDay[];
}): Promise<Pick<TimelineResponse, "nextCursor" | "previousCursor">> {
  const newestDay = options.days[0]?.capturedOn;
  const oldestDay = options.days.at(-1)?.capturedOn;
  if (newestDay === undefined || oldestDay === undefined) {
    return { nextCursor: null, previousCursor: null };
  }
  const edges = await options.pageOptions.database
    .selectNoFrom([
      _getDayExistenceExpression({
        pageOptions: options.pageOptions,
        boundaryDay: oldestDay,
        direction: "older",
      }).as("hasOlder"),
      _getDayExistenceExpression({
        pageOptions: options.pageOptions,
        boundaryDay: newestDay,
        direction: "newer",
      }).as("hasNewer"),
    ])
    .executeTakeFirstOrThrow();
  const filterDigest = makeDigestFromFilter(options.pageOptions.filter);
  return {
    nextCursor: edges.hasOlder
      ? makeTimelineCursorFromPageState({
          boundaryDay: oldestDay,
          filterDigest,
          direction: "older",
        })
      : null,
    previousCursor: edges.hasNewer
      ? makeTimelineCursorFromPageState({
          boundaryDay: newestDay,
          filterDigest,
          direction: "newer",
        })
      : null,
  };
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
    boundaryDay: options.cursor?.boundaryDay,
    direction: options.cursor?.direction ?? "older",
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
    ...(await _readEdgeCursors({ pageOptions: options, days: stream.days })),
    resultCount: await _readResultCount(options),
  };
}
