import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import classes from "@/system/system.module.css";
import { ItemMeta } from "@/surfaces/Item/ItemMeta";
import { ItemReactions } from "@/surfaces/Item/ItemReactions";
import { PhotoFrame } from "@/surfaces/Item/PhotoFrame";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  timezone: string;
};

/** The left column: the frame, the line under it, the reaction, the run. */
export function ItemMediaColumn({
  detail,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      <PhotoFrame media={detail.media} />
      <ItemMeta detail={detail} timezone={timezone} />
      <div className={classes.frameReactions}>
        {/* Keyed by item: this column is not remounted on a sibling move,
            and a reaction belongs to one item. */}
        <ItemReactions key={detail.itemId} detail={detail} viewer={viewer} />
      </div>
    </div>
  );
}
