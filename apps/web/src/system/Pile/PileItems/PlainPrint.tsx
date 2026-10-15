import { useSeedMediaPreview } from "@/media/useSeedMediaPreview";
import type { ReactNode } from "react";
import type { ItemSummary } from "@memory-shoebox/shared";
import { visibilityLabel } from "@/system/labelHelpers/labelHelpers";
import { Print } from "@/system/Pile/Print";

type Props = {
  item: ItemSummary;
  seed: number;

  onOpenItem?: (itemId: string) => void;
};

/** One plain print, latched by its own item id. */
export function PlainPrint({
  item,
  seed,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  useSeedMediaPreview({
    itemId: item.itemId,
    media: item.media,
    kind: item.kind,
  });
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
      onClick={() => {
        return onOpenItem?.(item.itemId);
      }}
    />
  );
}
