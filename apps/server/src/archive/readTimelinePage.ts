import type {
  ItemSummary,
  MediaSource,
  MemberRef,
  MilestoneRef,
  TimelineDay,
  TimelineResponse,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import {
  makeDrawnEntriesFromItemRows,
  type DrawnEntry,
} from "./collapseBursts.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import { makeAltTextFromItem } from "./makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "./makeMediaRefFromSources.ts";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
  rankMilestonesForDay,
} from "./milestoneSpans.ts";
import { readBurstCovers } from "./readBurstCovers.ts";
import { readDayStream } from "./readDayStream.ts";
import type { CandidateDay } from "./readItemDays.ts";
import { readItemsForDays } from "./readItemsForDays.ts";
import { readMediaSources } from "./readMediaSources.ts";
import { readMemberRefs } from "./readMemberRefs.ts";
import { readMilestoneItemCounts } from "./readMilestoneItemCounts.ts";
import { readPeopleNamesByItemId } from "./readPeopleNamesByItemId.ts";
import { readVisibilitySummaries } from "./readVisibilitySummaries.ts";
import { hasAnyFilter, type TimelineFilter } from "./selectionFilter.ts";
import {
  makeDigestFromFilter,
  makeOpenedIdsFromPage,
  makeTimelineCursorFromPageState,
  type TimelinePageState,
} from "./timelineCursor.ts";

/** Everything the page needs about its items, one batched read each. */
type DrawnItemLookups = {
  mediaSources: Map<string, Map<string, MediaSource>>;
  personNames: Map<string, string[]>;
  visibilities: Map<string, VisibilitySummary>;
  members: Map<string, MemberRef>;
  timezone: string;
};

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

  const itemsByDay = await _readItemsByDay({
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
    resultCount:
      hasAnyFilter(options.filter) && options.cursor === undefined
        ? await countSelectedItems({
            database: options.database,
            viewer: options.viewer,
            filter: options.filter,
          })
        : null,
  };
}

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

/** Queries 3 to 9: the prints on the page, ready to serve, grouped by day. */
async function _readItemsByDay(options: {
  pageOptions: Readonly<TimelinePageOptions>;
  days: readonly string[];
}): Promise<Map<string, ItemSummary[]>> {
  const rows = await readItemsForDays({
    database: options.pageOptions.database,
    viewer: options.pageOptions.viewer,
    filter: options.pageOptions.filter,
    days: options.days,
  });

  const entries = makeDrawnEntriesFromItemRows({
    rows,
    coverItemIdsByBurstId: await readBurstCovers({
      database: options.pageOptions.database,
      burstIds: [
        ...new Set(
          rows.flatMap((row) => {
            return row.burstId === null ? [] : [row.burstId];
          }),
        ),
      ],
    }),
  });

  if (entries.length === 0) {
    return new Map();
  }

  const lookups = await _readDrawnItemLookups({
    pageOptions: options.pageOptions,
    entries,
  });

  return entries.reduce<Map<string, ItemSummary[]>>((itemsByDay, entry) => {
    const summary = _makeItemSummaryFromEntry({ entry, lookups });
    if (summary === undefined) {
      options.pageOptions.logger?.warn(
        { itemId: entry.item.itemId },
        "an item with no renditions was counted and not drawn",
      );
      return itemsByDay;
    }
    const items = itemsByDay.get(entry.item.capturedOn) ?? [];
    items.push(summary);
    itemsByDay.set(entry.item.capturedOn, items);
    return itemsByDay;
  }, new Map());
}

/** Queries 5 to 9, keyed by the ids actually drawn. */
async function _readDrawnItemLookups(options: {
  pageOptions: Readonly<TimelinePageOptions>;
  entries: readonly DrawnEntry[];
}): Promise<DrawnItemLookups> {
  const itemIds = options.entries.map((entry) => {
    return entry.item.itemId;
  });
  const ruleIds = [
    ...new Set(
      options.entries.map((entry) => {
        return entry.item.visibilityRuleId;
      }),
    ),
  ];

  const [mediaSources, personNames, visibilities, members, settings] =
    await Promise.all([
      readMediaSources({
        database: options.pageOptions.database,
        b2: options.pageOptions.b2,
        itemIds,
        now: options.pageOptions.now,
        ttlSeconds: appConfig.media.signedUrlTtlSeconds,
      }),
      readPeopleNamesByItemId({
        database: options.pageOptions.database,
        itemIds,
      }),
      readVisibilitySummaries({
        database: options.pageOptions.database,
        ruleIds,
      }),
      readMemberRefs(options.pageOptions.database),
      readInstanceSettings({
        database: options.pageOptions.database,
        keys: ["shoebox.timezone"],
      }),
    ]);

  return {
    mediaSources,
    personNames,
    visibilities,
    members,
    timezone: settings["shoebox.timezone"],
  };
}

/** One print, or nothing at all when its renditions are missing. */
function _makeItemSummaryFromEntry(options: {
  entry: DrawnEntry;
  lookups: Readonly<DrawnItemLookups>;
}): ItemSummary | undefined {
  const { item, burst } = options.entry;
  const media = makeMediaRefFromSources({
    sources: options.lookups.mediaSources.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: item.altTextOverride,
      personNames: options.lookups.personNames.get(item.itemId) ?? [],
      capturedAt: item.capturedAt,
      timezone: options.lookups.timezone,
    }),
  });

  if (media === undefined) {
    return undefined;
  }

  return {
    itemId: item.itemId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    media,
    isUnseen: item.isUnseen,
    uploadedBy: options.lookups.members.get(item.uploadedBy) ?? {
      memberId: item.uploadedBy,
      displayName: "",
    },
    visibility: options.lookups.visibilities.get(item.visibilityRuleId) ?? {
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: burst ?? null,
  };
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
