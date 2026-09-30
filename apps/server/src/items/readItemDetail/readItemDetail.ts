import type { ItemDetail } from "@memory-shoebox/shared";
import {
  makeBurstAndFramesFromParts,
  makeItemDetailFromParts,
  makeMediaRefForItem,
} from "./makeItemDetailFromParts.ts";
import { readBurstParts } from "./readBurstParts.ts";
import type { ItemDetailOptions } from "./readItemDetail.types.ts";
import { readItemDetailParts } from "./readItemDetailParts.ts";

/**
 * The permalink payload, in one response.
 *
 * **This is the shape every route in the slice returns**, the read route and
 * every mutation alike, so that saving a description and re-opening the
 * photograph cannot produce two different pictures of the same item.
 *
 * Twelve reads for an item outside a burst and fifteen for one inside it,
 * none of them in a loop, and four N+1 risks avoided by name: the thread's
 * reactions are one `comment_id IN (...)`; the strip's people are one
 * `item_id IN (...)`, because every frame's alt text composes from its own
 * people; the renditions for the item and the strip are one batched fetch;
 * and the members table is read once and every author and reactor resolved
 * from it. Nothing here is per comment or per frame, which is the property
 * the query-count test pins.
 *
 * A burst costs exactly three reads more than a plain item: the strip's
 * capped rows, the aggregate beside them, and the stored cover. Composing the
 * strip from the `mediaSources`, `peopleByItemId` and timezone this already
 * holds is what keeps those two batched reads to one each: fetching them a
 * second time for the strip alone makes queries 3 and 6 two batched reads
 * apiece, where the contract says one. The aggregate is the one that cannot
 * be folded away: every figure it answers is measured over the whole visible
 * burst, and the rows beside it are capped.
 *
 * It does **not** count the open. Only `GET /api/items/:itemId` does that, and
 * it does it after this returns: saving a description is not opening a
 * photograph.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.b2 The Backblaze client.
 * @param options.viewer The request's viewer.
 * @param options.item The row `getVisibleItemOr404` already resolved.
 * @param options.now The request's clock.
 */
export async function readItemDetail(
  options: Readonly<ItemDetailOptions>,
): Promise<ItemDetail> {
  const { item, viewer } = options;

  if (item.kind === "video" && item.durationMs === null) {
    // The transport positions every pinned mark as `at_seconds / duration`,
    // so without it every mark lands wrong on first paint and then jumps.
    // That is an ingest defect, and a 500 is more honest than a payload whose
    // marks are guaranteed wrong.
    throw new Error(`Video ${item.itemId} has no stored duration.`);
  }

  const burstParts =
    item.burstId === null
      ? undefined
      : await readBurstParts({
          database: options.database,
          viewer,
          item,
          burstId: item.burstId,
        });

  const parts = await readItemDetailParts({
    detailOptions: options,
    burstRows: burstParts?.rows ?? [],
  });

  const { burst, burstFrames } = makeBurstAndFramesFromParts({
    detailOptions: options,
    burstParts,
    parts,
    storedCoverItemId:
      item.burstId === null ? undefined : parts.burstCovers.get(item.burstId),
  });

  return makeItemDetailFromParts({
    detailOptions: options,
    parts,
    media: makeMediaRefForItem({
      item,
      people: parts.peopleByItemId.get(item.itemId) ?? [],
      parts,
    }),
    burst,
    burstFrames,
    // Null whenever there is no burst to be a position in, which includes the
    // single visible frame that draws as a plain print.
    burstPosition: burst === null ? null : (burstParts?.framePosition ?? null),
  });
}
