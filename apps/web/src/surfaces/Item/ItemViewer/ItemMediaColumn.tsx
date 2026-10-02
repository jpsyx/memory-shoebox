import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ItemMeta } from "@/surfaces/Item/ItemMeta";
import { PhotoFrame } from "@/surfaces/Item/PhotoFrame";

type Props = {
  detail: ItemDetail;
  timezone: string;
};

/** The left column: the frame, the line under it, and what follows it. */
export function ItemMediaColumn({
  detail,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      <PhotoFrame media={detail.media} />
      <ItemMeta detail={detail} timezone={timezone} />
    </div>
  );
}
