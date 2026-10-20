import type { ReactNode } from "react";
import { ItemCommentDraftProvider } from "@/surfaces/Item/ItemConversation/ItemCommentDraftProvider";
import { ItemSurfaceContent } from "./ItemSurfaceContent";

type Props = { itemId: string };

/** Keeps shared drafts alive through selected-item and detail-query changes. */
export function ItemSurface({ itemId }: Readonly<Props>): ReactNode {
  return (
    <ItemCommentDraftProvider>
      <ItemSurfaceContent itemId={itemId} />
    </ItemCommentDraftProvider>
  );
}
