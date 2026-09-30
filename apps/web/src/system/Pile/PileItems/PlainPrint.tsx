import type { ReactNode } from "react";
import type { ItemSummary } from "@memory-shoebox/shared";
import { visibilityLabel } from "@/system/labelHelpers/labelHelpers";
import { Print } from "@/system/Pile/Print";

type Props = {
  item: ItemSummary;
  seed: number;
  eager: boolean;
  onOpenItem?: (itemId: string) => void;
};

/** One plain print, latched by its own item id. */
export function PlainPrint({
  item,
  seed,
  eager,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  return (
    <Print
      media={item.media}
      seed={seed}
      unseen={item.isUnseen}
      itemId={item.itemId}
      restrictedLabel={
        item.visibility.mode === "everyone"
          ? undefined
          : visibilityLabel(item.visibility)
      }
      eager={eager}
      onClick={() => {
        return onOpenItem?.(item.itemId);
      }}
    />
  );
}
