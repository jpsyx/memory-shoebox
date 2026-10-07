import type { ItemSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Ghosts } from "@/system/Pile/Ghosts";
import { Print } from "@/system/Pile/Print";
import { Pile } from "@/system/Pile/Pile";
import { Prose } from "@/system/typography/Prose";
type Props = { items: readonly ItemSummary[]; isPending: boolean };

/**
 * Reuses archive prints and its honest empty footprint without fictional
 * imagery.
 */
export function ArrangementPrints({
  items,
  isPending,
}: Readonly<Props>): ReactNode {
  return items.length === 0 ? (
    <>
      <Ghosts />
      <Prose>
        {isPending
          ? "Reading the timeline…"
          : "No photographs on the door yet. This is the timeline's empty footprint."}
      </Prose>
    </>
  ) : (
    <div role="img" aria-label="Miniature of visible archive photographs">
      <div inert>
        <Pile>
          {items.map((item, seed) => {
            return (
              <Print key={item.itemId} media={item.media} seed={seed} eager />
            );
          })}
        </Pile>
      </div>
    </div>
  );
}
