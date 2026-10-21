import { SelectedMediaPreview } from "@/media/SelectedMediaPreview";
import type {
  ItemDetail,
  MediaPreview,
  MemberRef,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import type { ItemPresentation } from "../ItemViewer.types";
import classes from "./ItemMediaColumn.module.css";
import { SiblingStrip } from "../../SiblingStrip/SiblingStrip";
import { ItemReactions } from "../ItemReactions/ItemReactions";
import { PhotoFrame } from "../PhotoFrame/PhotoFrame";

type Props = {
  detail: ItemDetail;
  selectedPreview?: MediaPreview;
  isPlaceholder: boolean;
  viewer: MemberRef;
  onComment: () => void;
  onEnterTheater: () => void;
  presentation?: ItemPresentation;
};

/** The photo and its shared reaction bar; the sibling strip stays mounted. */
export function ItemMediaColumn({
  detail,
  selectedPreview,
  isPlaceholder,
  viewer,
  onComment,
  onEnterTheater,
  presentation = "page",
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
          onEnterTheater={onEnterTheater}
          appearance={presentation === "theater" ? "theater" : "paper"}
        />
      )}
      <div
        className={clsx(
          classes.itemMediaColumnFooter,
          presentation === "theater" && classes.theater,
        )}
      >
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
