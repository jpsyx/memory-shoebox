import {
  type BurstFrameRef,
  type BurstSummary,
  type ItemDetail,
  type MediaRef,
  type PersonRef,
} from "@memory-shoebox/shared";
import { makeAltTextFromItem } from "../../archive/makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "../../archive/makeMediaRefFromSources.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";
import { makeItemCapabilitiesFromItem } from "../itemPermissions.ts";
import { makeBurstSummaryFromRows } from "../makeBurstSummaryFromRows.ts";
import { makeBurstFrameRefsFromRows } from "../readBurstFrameRefs/makeBurstFrameRefsFromRows.ts";
import type { BurstParts } from "./readBurstParts.ts";
import type { ItemDetailOptions } from "./readItemDetail.types.ts";
import type { ItemDetailParts } from "./readItemDetailParts.ts";

/**
 * This item's print, or the end of the ingest defect that lost it.
 *
 * @param options.item The item the permalink is for.
 * @param options.people Who is in it, for the composed alt text.
 * @param options.parts Every read the payload is built from.
 */
export function makeMediaRefForItem(options: {
  item: VisibleItem;
  people: readonly PersonRef[];
  parts: ItemDetailParts;
}): MediaRef {
  const { item } = options;
  const media = makeMediaRefFromSources({
    sources: options.parts.mediaSources.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: item.altTextOverride,
      personNames: options.people.map((person) => {
        return person.displayName;
      }),
      capturedAt: item.capturedAt,
      timezone: options.parts.timezone,
    }),
  });

  if (media === undefined) {
    // The pile counts an item with no renditions and does not draw it. A
    // permalink has nothing to fall back to, so this is the ingest defect
    // reaching its end.
    throw new Error(`Item ${item.itemId} has no renditions to draw.`);
  }
  return media;
}

/**
 * The burst this item sits in and the strip beside it, decided together.
 *
 * A burst of one visible frame is not a burst: it draws as a plain print, and
 * so it carries no strip either. Deciding the two in one place is what keeps
 * a summary and a strip from contradicting each other.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.burstParts The strip's rows and the aggregate beside them.
 * @param options.parts Every read the payload is built from.
 * @param options.storedCoverItemId `bursts.cover_item_id`, visible or not.
 */
export function makeBurstAndFramesFromParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  burstParts: BurstParts | undefined;
  parts: ItemDetailParts;
  storedCoverItemId: string | undefined;
}): { burst: BurstSummary | null; burstFrames: BurstFrameRef[] } {
  const { item } = options.detailOptions;
  const burstParts = options.burstParts;
  const burst =
    item.burstId === null || burstParts === undefined
      ? null
      : makeBurstSummaryFromRows({
          burstId: item.burstId,
          rows: burstParts.rows,
          totals: burstParts.totals,
          storedCoverItemId: options.storedCoverItemId,
        });

  return {
    burst,
    // The strip is composed from the maps `readItemDetailParts` already read
    // over the item **and** its siblings, never from three reads of its own:
    // `items.md` § Performance queries 3 and 6 are each one batched read
    // covering both, and re-signing the strip here made them two.
    burstFrames:
      burst === null || burstParts === undefined
        ? []
        : makeBurstFrameRefsFromRows({
            rows: burstParts.rows,
            sources: {
              mediaSources: options.parts.mediaSources,
              peopleByItemId: options.parts.peopleByItemId,
              timezone: options.parts.timezone,
            },
          }),
  };
}

/**
 * The payload, once every read and every derived value is in hand.
 *
 * @param options.detailOptions What the composer was called with.
 * @param options.parts Every read the payload is built from.
 * @param options.media This item's own print.
 * @param options.burst The burst it sits in, or null.
 * @param options.burstFrames The strip beside it, empty when there is none.
 * @param options.burstPosition Its place among the visible siblings.
 */
export function makeItemDetailFromParts(options: {
  detailOptions: Readonly<ItemDetailOptions>;
  parts: ItemDetailParts;
  media: MediaRef;
  burst: BurstSummary | null;
  burstFrames: readonly BurstFrameRef[];
  burstPosition: number | null;
}): ItemDetail {
  const { item, viewer } = options.detailOptions;
  const { parts } = options;

  return {
    itemId: item.itemId,
    kind: item.kind,
    capturedAt: item.capturedAt,
    capturedOn: item.capturedOn,
    media: options.media,
    isUnseen: parts.isUnseen,
    uploadedBy: parts.members.get(item.uploadedBy) ?? {
      memberId: item.uploadedBy,
      displayName: "",
    },
    visibility: parts.visibilities.get(item.visibilityRuleId) ?? {
      visibilityRuleId: item.visibilityRuleId,
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: options.burst,
    captureSource: item.captureSource,
    capturedAtOffsetMinutes: item.capturedAtOffsetMinutes,
    originalCapturedAt: item.originalCapturedAt,
    altTextOverride: item.altTextOverride,
    // **`burstPosition` is this item's place among the visible siblings**, the
    // set `burst.visibleFrameCount` counts, because the contract reads the one
    // against the other. It is deliberately not a position in `burstFrames`:
    // that list is capped at `appConfig.items.burstStripMaxFrames`, so a frame
    // numbered over it is null past the cap, which is exactly the frame a
    // viewer arrives at through `GET /api/bursts/:burstId/frames`. The cost is
    // that a sibling whose renditions an ingest defect lost shifts the strip's
    // dense numbering out from under it; the count already carries that same
    // gap, so the caption and its denominator still agree with each other.
    burstPosition: options.burstPosition,
    burstFrames: [...options.burstFrames],
    tags: parts.tags,
    people: parts.peopleByItemId.get(item.itemId) ?? [],
    milestones: parts.milestones,
    comments: parts.comments,
    reactions: parts.reactions,
    capabilities: makeItemCapabilitiesFromItem({
      viewer,
      uploadedBy: item.uploadedBy,
      ...parts.removalGate,
    }),
  };
}
