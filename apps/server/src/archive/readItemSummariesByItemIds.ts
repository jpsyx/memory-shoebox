import type { ItemSummary } from "@memory-shoebox/shared";
import type { FastifyBaseLogger } from "fastify";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import {
  makeDrawnEntriesFromItemRows,
  type DrawnBurst,
} from "./makeDrawnEntriesFromItemRows.ts";
import { makeAltTextFromItem } from "./makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "./makeMediaRefFromSources.ts";
import { readBurstCovers } from "./readBurstCovers.ts";
import type { ItemRow } from "./readItemsForDays.ts";
import { readMediaSources } from "./readMediaSources.ts";
import { readMemberRefs } from "./readMemberRefs.ts";
import { readPeopleNamesByItemId } from "./readPeopleNamesByItemId.ts";
import { readVisibilitySummaries } from "./readVisibilitySummaries.ts";

/** Batched drawable item reads, retaining the requested frame identities. */
type SummaryReadOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  itemIds: readonly string[];
  now: Date;
  logger?: Pick<FastifyBaseLogger, "warn">;
};

function _getItemRowsQuery(options: Readonly<SummaryReadOptions>) {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database.selectFrom("items"),
  })
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select([
      "items.id as itemId",
      "items.kind as kind",
      "items.captured_at as capturedAt",
      "items.captured_on as capturedOn",
      "items.duration_ms as durationMs",
      "items.alt_text as altTextOverride",
      "items.visibility_rule_id as visibilityRuleId",
      "items.uploaded_by as uploadedBy",
      "items.burst_id as burstId",
      "item_views.item_id as seenItemId",
    ])
    .orderBy("items.captured_at", "asc")
    .orderBy("items.seq", "asc");
}

function _makeItemRowsFromRows(
  rows: Awaited<ReturnType<ReturnType<typeof _getItemRowsQuery>["execute"]>>,
): ItemRow[] {
  return rows.map((row) => {
    return {
      ...row,
      kind: row.kind === "video" ? "video" : "photo",
      isUnseen: row.seenItemId === null,
    };
  });
}

async function _readBurstMetadata(
  options: Readonly<SummaryReadOptions>,
  rows: readonly ItemRow[],
): Promise<Map<string, DrawnBurst>> {
  const burstIds = [
    ...new Set(
      rows.flatMap((row) => {
        return row.burstId === null ? [] : [row.burstId];
      }),
    ),
  ];
  if (burstIds.length === 0) {
    return new Map();
  }
  const [siblings, covers] = await Promise.all([
    _getItemRowsQuery(options)
      .where("items.burst_id", "in", burstIds)
      .execute(),
    readBurstCovers({ database: options.database, burstIds }),
  ]);
  const entries = makeDrawnEntriesFromItemRows({
    rows: _makeItemRowsFromRows(siblings),
    coverItemIdsByBurstId: covers,
  });
  return new Map(
    entries.flatMap((entry) => {
      return entry.burst === undefined
        ? []
        : [[entry.burst.burstId, entry.burst] as const];
    }),
  );
}

async function _readSummaryLookups(
  options: Readonly<SummaryReadOptions>,
  rows: readonly ItemRow[],
) {
  const itemIds = rows.map((row) => {
    return row.itemId;
  });
  const [sources, people, visibilities, members, settings, bursts] =
    await Promise.all([
      readMediaSources({
        ...options,
        itemIds,
        ttlSeconds: appConfig.media.signedUrlTtlSeconds,
      }),
      readPeopleNamesByItemId({ database: options.database, itemIds }),
      readVisibilitySummaries({
        database: options.database,
        ruleIds: [
          ...new Set(
            rows.map((row) => {
              return row.visibilityRuleId;
            }),
          ),
        ],
      }),
      readMemberRefs(options.database),
      readInstanceSettings({
        database: options.database,
        keys: ["shoebox.timezone"],
      }),
      _readBurstMetadata(options, rows),
    ]);
  return { sources, people, visibilities, members, settings, bursts };
}

function _makeSummaryFromItem(
  item: Readonly<ItemRow>,
  media: ItemSummary["media"],
  lookups: Awaited<ReturnType<typeof _readSummaryLookups>>,
): ItemSummary {
  return {
    itemId: item.itemId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    media,
    isUnseen: item.isUnseen,
    uploadedBy: lookups.members.get(item.uploadedBy) ?? {
      memberId: item.uploadedBy,
      displayName: "",
    },
    visibility: lookups.visibilities.get(item.visibilityRuleId) ?? {
      visibilityRuleId: item.visibilityRuleId,
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst:
      item.burstId === null ? null : (lookups.bursts.get(item.burstId) ?? null),
  };
}

function _makeSummariesFromRows(
  options: Readonly<SummaryReadOptions>,
  rows: readonly ItemRow[],
  lookups: Awaited<ReturnType<typeof _readSummaryLookups>>,
): Map<string, ItemSummary> {
  return new Map(
    rows.flatMap((item) => {
      const media = makeMediaRefFromSources({
        sources: lookups.sources.get(item.itemId) ?? new Map(),
        durationMs: item.durationMs,
        altText: makeAltTextFromItem({
          altTextOverride: item.altTextOverride,
          personNames: lookups.people.get(item.itemId) ?? [],
          capturedAt: item.capturedAt,
          timezone: lookups.settings["shoebox.timezone"],
        }),
      });
      if (media === undefined) {
        (options.logger ?? console).warn(
          { itemId: item.itemId },
          "an item with no renditions was counted and not drawn",
        );
        return [];
      }
      return [
        [item.itemId, _makeSummaryFromItem(item, media, lookups)] as const,
      ];
    }),
  );
}

/** Reads visible drawable items and full visible burst siblings in batches. */
export async function readItemSummariesByItemIds(
  options: Readonly<SummaryReadOptions>,
): Promise<Map<string, ItemSummary>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }
  const rows = _makeItemRowsFromRows(
    await _getItemRowsQuery(options)
      .where("items.id", "in", [...options.itemIds])
      .execute(),
  );
  if (rows.length === 0) {
    return new Map();
  }
  return _makeSummariesFromRows(
    options,
    rows,
    await _readSummaryLookups(options, rows),
  );
}
