import { SelectedMediaPreview } from "@/media/SelectedMediaPreview";
import type {
  ItemDetail,
  MediaPreview,
  MemberRef,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import classes from "../ItemConversation/ItemConversation.module.css";
import { SiblingStrip } from "../SiblingStrip/SiblingStrip";
import { ItemReactions } from "./ItemReactions/ItemReactions";
import { PhotoFrame } from "./PhotoFrame/PhotoFrame";

type Props = {
  detail: ItemDetail;
  selectedPreview?: MediaPreview;
  isPlaceholder: boolean;
  viewer: MemberRef;
  onComment: () => void;
};

/** The photo and its shared reaction bar; the sibling strip stays mounted. */
export function ItemMediaColumn({
  detail,
  selectedPreview,
  isPlaceholder,
  viewer,
  onComment,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {isPlaceholder ? (
        <SelectedMediaPreview preview={selectedPreview} />
      ) : (
        <PhotoFrame
          key={detail.itemId}
          media={detail.media}
          itemId={detail.itemId}
        />
      )}
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
