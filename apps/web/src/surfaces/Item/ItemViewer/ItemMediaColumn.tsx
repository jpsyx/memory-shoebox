import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ItemReactions } from "./ItemReactions/ItemReactions";
import { PhotoFrame } from "./PhotoFrame";
import classes from "../ItemConversation/ItemConversation.module.css";
import { SiblingStrip } from "../SiblingStrip/SiblingStrip";

type Props = {
  detail: ItemDetail;
  isPlaceholder: boolean;
  viewer: MemberRef;
  onComment: () => void;
};

/** The photo and its shared reaction bar; the sibling strip stays mounted. */
export function ItemMediaColumn({
  detail,
  isPlaceholder,
  viewer,
  onComment,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <PhotoFrame media={detail.media} />
      <div className={classes.photoFooter}>
        <div inert={isPlaceholder}>
          <ItemReactions
            key={detail.itemId}
            detail={detail}
            viewer={viewer}
            onComment={onComment}
          />
        </div>
        <SiblingStrip detail={detail} />
      </div>
    </>
  );
}
