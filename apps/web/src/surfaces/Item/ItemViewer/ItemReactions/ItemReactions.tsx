import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Reactions } from "@/system/Reactions/Reactions";
import { Prose } from "@/system/typography/Prose";
import { useItemReaction } from "@/surfaces/Item/itemWrites/useItemReaction/useItemReaction";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  onComment: () => void;
};

/**
 * The reaction on the photograph or the video itself, between the frame's own
 * facts and the run it came from. One tap, each choice carrying its word
 * (`DESIGN.md` § Reactions), and never an email.
 */
export function ItemReactions({
  detail,
  viewer,
  onComment,
}: Readonly<Props>): ReactNode {
  const { react, error } = useItemReaction({ itemId: detail.itemId, viewer });
  return (
    <>
      <Reactions
        variant="bar"
        onComment={onComment}
        reactions={detail.reactions}
        viewer={viewer}
        onReact={react}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </>
  );
}
