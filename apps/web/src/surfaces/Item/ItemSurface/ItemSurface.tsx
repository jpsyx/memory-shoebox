import type { ReactNode } from "react";
import { ItemCommentDraftProvider } from "@/surfaces/Item/ItemConversation/ItemCommentDraftProvider/ItemCommentDraftProvider";
import { useVideoTransport } from "../ItemViewer/useVideoTransport";
import { useTheaterMode } from "../ItemTheater/useTheaterMode/useTheaterMode";
import { ItemTheaterHost } from "../ItemTheater/ItemTheaterHost";
import { ItemSurfaceContent } from "./ItemSurfaceContent";

type Props = { itemId: string };

/** Keeps shared drafts alive through selected-item and detail-query changes. */
export function ItemSurface({ itemId }: Readonly<Props>): ReactNode {
  const transport = useVideoTransport(itemId);
  const theater = useTheaterMode({ onBeforeExit: transport.pause });
  return (
    <ItemCommentDraftProvider>
      <ItemTheaterHost theater={theater}>
        <ItemSurfaceContent
          itemId={itemId}
          theater={theater}
          transport={transport}
        />
      </ItemTheaterHost>
    </ItemCommentDraftProvider>
  );
}
