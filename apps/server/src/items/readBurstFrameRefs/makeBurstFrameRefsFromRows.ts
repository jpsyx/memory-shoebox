import type { BurstFrameRef } from "@memory-shoebox/shared";
import { makeMediaRefFromSources } from "../../archive/makeMediaRefFromSources.ts";
import { makeAltTextFromItem } from "../../archive/makeAltTextFromItem.ts";
import type { BurstFrameRow } from "./readBurstFrameRows.ts";
import type { BurstFrameSources } from "./readBurstFrameSources.ts";

/**
 * Composes visible sibling frames without another query. Missing previews keep
 * their catalog layout and dense 1-based position, including across pages.
 * Visibility filtering happens before these rows arrive; hidden frames never
 * reserve positions. The item's burstPosition uses the full visible sibling set.
 */
export function makeBurstFrameRefsFromRows(options: {
  rows: readonly BurstFrameRow[];
  sources: BurstFrameSources;
  startPosition?: number;
}): BurstFrameRef[] {
  const { rows, sources } = options;
  const startPosition = options.startPosition ?? 1;

  const drawableFrames = rows.flatMap((row) => {
    const renditions = sources.mediaSources.get(row.itemId);
    const thumb = makeMediaRefFromSources({
      sources: renditions ?? new Map(),
      kind: "photo",
      width: row.width,
      height: row.height,
      previewState: "unavailable",
      durationMs: null,
      altText: "",
    }).thumb;

    return [
      {
        itemId: row.itemId,
        width: row.width,
        height: row.height,
        previewState:
          thumb === null ? ("unavailable" as const) : ("ready" as const),
        canRemoveFromBurst: row.canRemoveFromBurst ?? false,
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
