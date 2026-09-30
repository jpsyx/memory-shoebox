import type { FastifyBaseLogger } from "fastify";
import type { BurstSummary, ItemSummary } from "@memory-shoebox/shared";
import { makeAltTextFromItem } from "../../archive/makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "../../archive/makeMediaRefFromSources.ts";
import { makeBurstSummaryFromRows } from "../makeBurstSummaryFromRows.ts";
import { makeBurstFrameTotalsFromRows } from "../readBurstFrameRefs/readBurstFrameTotals.ts";
import type { BurstFrameRow } from "../readBurstFrameRefs/readBurstFrameRows.ts";
import type { ItemSummaryParts } from "./readItemSummaryParts.ts";
import type { ItemSummaryRow } from "./readItemSummaryRows.ts";

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

/** This row's burst summary, or null when it sits outside one. */
function _getBurstSummaryForRow(options: {
  row: ItemSummaryRow;
  parts: Readonly<ItemSummaryParts>;
}): BurstSummary | null {
  const { row, parts } = options;
  if (row.burstId === null) {
    return null;
  }
  return _makeBurstSummaryForRow({
    burstId: row.burstId,
    siblings: parts.siblingsByBurstId.get(row.burstId) ?? [],
    storedCoverItemId: parts.covers.get(row.burstId),
  });
}

/** One print, or nothing at all when its renditions are missing. */
function _makeItemSummaryFromRow(options: {
  row: ItemSummaryRow;
  parts: Readonly<ItemSummaryParts>;
}): ItemSummary | undefined {
  const { row, parts } = options;
  const people = parts.peopleByItemId.get(row.itemId) ?? [];
  const media = makeMediaRefFromSources({
    sources: parts.mediaSources.get(row.itemId) ?? new Map(),
    durationMs: row.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: row.altTextOverride,
      personNames: people.map((person) => {
        return person.displayName;
      }),
      capturedAt: row.capturedAt,
      timezone: parts.timezone,
    }),
  });

  if (media === undefined) {
    return undefined;
  }

  return {
    itemId: row.itemId,
    kind: row.kind === "video" ? ("video" as const) : ("photo" as const),
    capturedAt: row.capturedAt,
    capturedOn: row.capturedOn,
    media,
    isUnseen: row.seenItemId === null,
    uploadedBy: parts.members.get(row.uploadedBy) ?? {
      memberId: row.uploadedBy,
      displayName: "",
    },
    visibility: parts.visibilities.get(row.visibilityRuleId) ?? {
      visibilityRuleId: row.visibilityRuleId,
      mode: "everyone" as const,
      label: null,
      subjects: [],
    },
    burst: _getBurstSummaryForRow({ row, parts }),
  };
}

/**
 * Every summary keyed by id, logging any whose renditions are missing.
 *
 * @param options.rows The requested items, already visibility-filtered.
 * @param options.parts Every read the summaries are composed from.
 * @param options.logger Where an undrawable item is reported.
 */
export function makeItemSummariesById(options: {
  rows: readonly ItemSummaryRow[];
  parts: Readonly<ItemSummaryParts>;
  logger?: FastifyBaseLogger;
}): Map<string, ItemSummary> {
  return options.rows.reduce<Map<string, ItemSummary>>((byId, row) => {
    const summary = _makeItemSummaryFromRow({ row, parts: options.parts });
    if (summary === undefined) {
      options.logger?.warn(
        { itemId: row.itemId },
        "an item with no renditions cannot be drawn",
      );
      return byId;
    }
    byId.set(row.itemId, summary);
    return byId;
  }, new Map());
}
