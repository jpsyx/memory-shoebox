import type { ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { Reactions } from "@/system/Reactions/Reactions";
import { Prose } from "@/system/typography/Prose";
import { reactionHint } from "@/surfaces/Item/itemCopy/itemCopy";
import { useItemReaction } from "@/surfaces/Item/itemWrites/useConversation";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * The reaction on the photograph or the video itself, between the frame's own
 * facts and the run it came from. One tap, each choice carrying its word
 * (`DESIGN.md` § Reactions), and never an email.
 */
export function ItemReactions({ detail, viewer }: Readonly<Props>): ReactNode {
  const { react, error } = useItemReaction({ itemId: detail.itemId, viewer });
  return (
    <>
      <Reactions
        onPanel
        reactions={detail.reactions}
        viewer={viewer}
        goesTo={reactionHint(detail.kind)}
        onReact={react}
      />
      {error === undefined ? null : (
        <Prose onPanel role="alert">
          {error}
        </Prose>
      )}
    </>
  );
}
