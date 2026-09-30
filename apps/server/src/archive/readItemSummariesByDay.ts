import type {
  ItemSummary,
  MediaSource,
  MemberRef,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import {
  makeDrawnEntriesFromItemRows,
  type DrawnEntry,
} from "./makeDrawnEntriesFromItemRows.ts";
import { makeAltTextFromItem } from "./makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "./makeMediaRefFromSources.ts";
import { readBurstCovers } from "./readBurstCovers.ts";
import { readItemsForDays } from "./readItemsForDays.ts";
import { readMediaSources } from "./readMediaSources.ts";
import { readMemberRefs } from "./readMemberRefs.ts";
import { readPeopleNamesByItemId } from "./readPeopleNamesByItemId.ts";
import type { TimelinePageOptions } from "./readTimelinePage.ts";
import { readVisibilitySummaries } from "./readVisibilitySummaries.ts";

/** Everything the page needs about its items, one batched read each. */
type DrawnItemLookups = {
  mediaSources: Map<string, Map<string, MediaSource>>;
  personNames: Map<string, string[]>;
  visibilities: Map<string, VisibilitySummary>;
  members: Map<string, MemberRef>;
  timezone: string;
};

/** The item and visibility-rule ids the batch reads below key off. */
function _makeIdsFromEntries(entries: readonly DrawnEntry[]): {
  itemIds: string[];
  ruleIds: string[];
} {
  const itemIds = entries.map((entry) => {
    return entry.item.itemId;
  });
  const ruleIds = [
    ...new Set(
      entries.map((entry) => {
        return entry.item.visibilityRuleId;
      }),
    ),
  ];
  return { itemIds, ruleIds };
}

/**
 * Queries 5 to 9, keyed by the ids actually drawn.
 *
 * Batching by drawn id rather than per item is what keeps a collapsed burst
 * cheap: a burst of forty-five frames draws one cover's renditions, one
 * uploader and one visibility rule, not forty-five of each.
 */
async function _readDrawnItemLookups(options: {
  pageOptions: Readonly<TimelinePageOptions>;
  entries: readonly DrawnEntry[];
}): Promise<DrawnItemLookups> {
  const { itemIds, ruleIds } = _makeIdsFromEntries(options.entries);

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
      visibilityRuleId: item.visibilityRuleId,
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: burst ?? null,
  };
}

/**
 * Groups each entry's summary by the day it was captured on.
 *
 * An entry whose renditions are missing is skipped and logged rather than
 * thrown: it was already counted by the day aggregate, so dropping it here is
 * the one defect this route can meet and must survive.
 */
function _makeItemsByDayFromEntries(options: {
  entries: readonly DrawnEntry[];
  lookups: Readonly<DrawnItemLookups>;
  pageOptions: Readonly<TimelinePageOptions>;
}): Map<string, ItemSummary[]> {
  return options.entries.reduce<Map<string, ItemSummary[]>>(
    (itemsByDay, entry) => {
      const summary = _makeItemSummaryFromEntry({
        entry,
        lookups: options.lookups,
      });
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
    },
    new Map(),
  );
}

/**
 * Queries 3 to 9: the prints on the page, ready to serve, grouped by day.
 *
 * This is the one place that turns a day aggregate into the pictures
 * themselves, and it does so in batches keyed by the ids actually drawn
 * rather than per item, per day, or per burst.
 */
export async function readItemSummariesByDay(options: {
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

  return _makeItemsByDayFromEntries({
    entries,
    lookups,
    pageOptions: options.pageOptions,
  });
}
