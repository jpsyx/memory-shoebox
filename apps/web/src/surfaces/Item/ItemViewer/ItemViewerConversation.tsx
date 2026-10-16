import type { ReactNode, RefObject } from "react";
import { VideoConversation } from "../VideoConversation/VideoConversation";
import { ItemConversation } from "../ItemConversation/ItemConversation";
import { ItemComments } from "../ItemConversation/ItemComments/ItemComments";
import { ItemMediaColumn } from "./ItemMediaColumn/ItemMediaColumn";
import type { Props as ViewerProps } from "./ItemViewer.types";
import type { VideoTransport } from "./useVideoTransport";

type Props = ViewerProps & {
  transport: VideoTransport;
  onDeleted: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Selects the authorized conversation while retaining each video's item key.
 */
export function ItemViewerConversation({
  detail,
  selectedPreview,
  isPlaceholder,
  viewer,
  timezone,
  transport,
  onDeleted,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const props = { detail, selectedPreview, isPlaceholder, viewer, timezone };
  return detail.kind === "video" && !isPlaceholder ? (
    <VideoConversation
      key={detail.itemId}
      {...props}
      transport={transport}
      onDeleted={onDeleted}
    />
  ) : (
    <ItemConversation
      {...props}
      onDeleted={onDeleted}
      media={
        <ItemMediaColumn
          {...props}
          onComment={() => {
            fieldRef.current?.focus();
          }}
        />
      }
      conversation={
        <ItemComments detail={detail} viewer={viewer} fieldRef={fieldRef} />
      }
    />
  );
}
