import type { FastifyBaseLogger } from "fastify";
import type { BurstSummary, ItemSummary } from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { makeAltTextFromItem } from "../archive/makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "../archive/makeMediaRefFromSources.ts";
import { readBurstCovers } from "../archive/readBurstCovers.ts";
import { readMediaSources } from "../archive/readMediaSources.ts";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { readPeopleRefsByItemId } from "../archive/readPeopleRefsByItemId.ts";
import { readVisibilitySummaries } from "../archive/readVisibilitySummaries.ts";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import { makeBurstSummaryFromRows } from "./makeBurstSummaryFromRows.ts";
import {
  makeBurstFrameTotalsFromRows,
  type BurstFrameRow,
} from "./readBurstFrameRefs.ts";

/**
 * One burst's summary, from siblings this reader holds in full.
 *
 * The `burst_id IN (...)` read is **uncapped**, so the totals come straight
 * off its rows: no aggregate is needed here, and none is paid for. The
 * permalink's rows are capped and its totals come from a query of their own,
 * which is the only difference between the two callers of
 * `makeBurstSummaryFromRows`.
 *
 * @param options.burstId The burst.
 * @param options.siblings Every visible sibling of it, uncapped.
 * @param options.storedCoverItemId `bursts.cover_item_id`, visible or not.
 */
function _makeBurstSummaryForRow(options: {
  burstId: string;
  siblings: readonly BurstFrameRow[];
  storedCoverItemId: string | undefined;
}): BurstSummary | null {
  return makeBurstSummaryFromRows({
    burstId: options.burstId,
    rows: options.siblings,
    totals: makeBurstFrameTotalsFromRows(options.siblings),
    storedCoverItemId: options.storedCoverItemId,
  });
}

/**
 * One `ItemSummary` per requested id, for a selection the client wants
 * refreshed.
 *
 * The caller is a selection on the timeline and wants its prints back, not
 * 264 comment threads, which is why this returns summaries and
 * `readItemDetail` is not called per item.
 *
 * Six queries for any number of ids: the items, their renditions, their
 * people, their rules, the members table, and the visible siblings of every
 * burst the selection touches in one `burst_id IN (...)`.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client.
 * @param options.viewer The request's viewer.
 * @param options.itemIds The selection, already checked.
 * @param options.now The request's clock.
 * @param options.logger Where an undrawable item is reported.
 */
export async function readItemSummariesByIds(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  itemIds: readonly string[];
  now: Date;
  logger?: FastifyBaseLogger;
}): Promise<ItemSummary[]> {
  if (options.itemIds.length === 0) {
    return [];
  }

  // Filtered before the join, not after: `applyVisibilityFilter`'s generic
  // signature is over `SelectQueryBuilder<Database, TB | "items", Output>`,
  // and joining `item_views` into the query passed in front of it collides
  // two structurally distinct instantiations of the same generic table set.
  // Applying the filter first and joining the builder it hands back avoids
  // that, and is the same order `readBurstFrameRefs.ts` already uses. The
  // member predicate belongs in the `ON`: in the `WHERE` it would turn the
  // anti-join inner and every seen item would disappear.
  const rows = await applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.kind as kind",
        "items.captured_at as capturedAt",
        "items.captured_on as capturedOn",
        "items.duration_ms as durationMs",
        "items.alt_text as altTextOverride",
        "items.uploaded_by as uploadedBy",
        "items.visibility_rule_id as visibilityRuleId",
        "items.burst_id as burstId",
      ])
      .where("items.id", "in", [...options.itemIds]),
  })
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select("item_views.item_id as seenItemId")
    .execute();

  const burstIds = [
    ...new Set(
      rows.flatMap((row) => {
        return row.burstId === null ? [] : [row.burstId];
      }),
    ),
  ];

  const [
    mediaSources,
    peopleByItemId,
    visibilities,
    members,
    settings,
    siblings,
    covers,
  ] = await Promise.all([
    readMediaSources({
      database: options.database,
      b2: options.b2,
      itemIds: rows.map((row) => {
        return row.itemId;
      }),
      now: options.now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleRefsByItemId({
      database: options.database,
      itemIds: rows.map((row) => {
        return row.itemId;
      }),
    }),
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
    burstIds.length === 0
      ? []
      : applyVisibilityFilter({
          viewer: options.viewer,
          query: options.database
            .selectFrom("items")
            .select([
              "items.burst_id as burstId",
              "items.id as itemId",
              "items.burst_index as burstIndex",
              "items.captured_at as capturedAt",
              "items.alt_text as altTextOverride",
            ])
            .where("items.burst_id", "in", burstIds),
        })
          .leftJoin("item_views", (join) => {
            return join
              .onRef("item_views.item_id", "=", "items.id")
              .on("item_views.member_id", "=", options.viewer.memberId);
          })
          .select("item_views.item_id as seenItemId")
          .orderBy("items.burst_index", "asc")
          .orderBy("items.id", "asc")
          .execute(),
    burstIds.length === 0
      ? new Map<string, string>()
      : readBurstCovers({ database: options.database, burstIds }),
  ]);

  const siblingsByBurstId = siblings.reduce<Map<string, BurstFrameRow[]>>(
    (grouped, row) => {
      if (row.burstId === null) {
        return grouped;
      }
      const existing = grouped.get(row.burstId) ?? [];
      existing.push({
        itemId: row.itemId,
        burstIndex: row.burstIndex,
        capturedAt: row.capturedAt,
        altTextOverride: row.altTextOverride,
        isUnseen: row.seenItemId === null,
      });
      grouped.set(row.burstId, existing);
      return grouped;
    },
    new Map(),
  );

  const summariesById = new Map(
    rows.flatMap((row) => {
      const people = peopleByItemId.get(row.itemId) ?? [];
      const media = makeMediaRefFromSources({
        sources: mediaSources.get(row.itemId) ?? new Map(),
        durationMs: row.durationMs,
        altText: makeAltTextFromItem({
          altTextOverride: row.altTextOverride,
          personNames: people.map((person) => {
            return person.displayName;
          }),
          capturedAt: row.capturedAt,
          timezone: settings["shoebox.timezone"],
        }),
      });

      if (media === undefined) {
        options.logger?.warn(
          { itemId: row.itemId },
          "an item with no renditions cannot be drawn",
        );
        return [];
      }

      return [
        [
          row.itemId,
          {
            itemId: row.itemId,
            kind:
              row.kind === "video" ? ("video" as const) : ("photo" as const),
            capturedAt: row.capturedAt,
            capturedOn: row.capturedOn,
            media,
            isUnseen: row.seenItemId === null,
            uploadedBy: members.get(row.uploadedBy) ?? {
              memberId: row.uploadedBy,
              displayName: "",
            },
            visibility: visibilities.get(row.visibilityRuleId) ?? {
              visibilityRuleId: row.visibilityRuleId,
              mode: "everyone" as const,
              label: null,
              subjects: [],
            },
            burst:
              row.burstId === null
                ? null
                : _makeBurstSummaryForRow({
                    burstId: row.burstId,
                    siblings: siblingsByBurstId.get(row.burstId) ?? [],
                    storedCoverItemId: covers.get(row.burstId),
                  }),
          },
        ],
      ];
    }),
  );

  // In the order the caller asked for them, so a selection redraws in place.
  return options.itemIds.flatMap((itemId) => {
    const summary = summariesById.get(itemId);
    return summary === undefined ? [] : [summary];
  });
}
