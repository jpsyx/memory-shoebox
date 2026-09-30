import type { BurstFrameRef } from "@memory-shoebox/shared";
import { makeAltTextFromItem } from "../../archive/makeAltTextFromItem.ts";
import type { BurstFrameRow } from "./readBurstFrameRows.ts";
import type { BurstFrameSources } from "./readBurstFrameSources.ts";

/**
 * Visible sibling rows to the strip the viewer sees: signed, numbered, and
 * carrying each frame's own alt text.
 *
 * **`position` is 1-based and dense over the frames actually returned, and is
 * never `items.burst_index`.** This is where a restricted frame would leak:
 * pass the stored index through and frames 6, 8, 9 tell the viewer there is a
 * frame 7 they may not open. A gap is a count of what you cannot see.
 *
 * That holds even for a frame this viewer may see but that this route cannot
 * draw, because its renditions are missing. To the viewer, a numbering gap
 * reads the same whatever caused it: "there is something here I cannot open".
 * So `position` is assigned only once a frame has cleared every reason it
 * might be dropped, over the frames that made it into the response, never
 * over the row list a drop was taken from. `visibleFrameCount`, computed by
 * `readBurstFrameTotals` over the whole visible sibling set, may still
 * count a frame this function had to drop for missing renditions: that
 * mismatch is the same accepted defect `readItemSummariesByDay` already logs
 * and survives for the pile, not a new one this reader has to close.
 *
 * **`ItemDetail.burstPosition` is not one of these positions.** It is the
 * frame's place among the visible siblings, which is the set
 * `burst.visibleFrameCount` counts and the set the contract reads it against.
 * Numbering it over the strip instead left it null for every frame past
 * `burstStripMaxFrames`, which is precisely the frame a viewer arrives at
 * through `GET /api/bursts/:burstId/frames`.
 *
 * **No queries of its own.** It composes what it is handed, so a caller whose
 * payload already covers the item and the strip pays for the renditions, the
 * people and the timezone once rather than twice.
 *
 * **Dense does not mean "from 1 on every page".** A fanned burst that runs to
 * more than one page numbers straight through: a `position` that restarted at
 * 1 on page two would tell the viewer there are two frame 1s in one burst.
 * `startPosition` is how the page after the first says where it begins, and it
 * counts frames actually handed over rather than rows read past, so a frame
 * dropped on the previous page reserves no number here either.
 *
 * @param options.rows The visible siblings, from `readBurstFrameRows`.
 * @param options.sources The three batched reads, covering at least `rows`.
 * @param options.startPosition The first frame's number. Defaults to 1.
 */
export function makeBurstFrameRefsFromRows(options: {
  rows: readonly BurstFrameRow[];
  sources: BurstFrameSources;
  startPosition?: number;
}): BurstFrameRef[] {
  const { rows, sources } = options;
  const startPosition = options.startPosition ?? 1;

  // Built without a position first: a frame dropped here for a missing
  // thumbnail must not reserve a number nobody gets, or the gap tells the
  // viewer exactly what `position` exists to hide.
  const drawableFrames = rows.flatMap((row) => {
    const renditions = sources.mediaSources.get(row.itemId);
    const thumb = renditions?.get("thumb") ?? renditions?.get("display");
    if (thumb === undefined) {
      // Counted by `visibleFrameCount` and not drawn, which is the same shape
      // the pile already uses for an item whose renditions have gone missing.
      return [];
    }

    return [
      {
        itemId: row.itemId,
        thumb,
        altText: makeAltTextFromItem({
          altTextOverride: row.altTextOverride,
          personNames: (sources.peopleByItemId.get(row.itemId) ?? []).map(
            (person) => {
              return person.displayName;
            },
          ),
          capturedAt: row.capturedAt,
          timezone: sources.timezone,
        }),
      },
    ];
  });

  return drawableFrames.map((frame, index) => {
    return { ...frame, position: startPosition + index };
  });
}
