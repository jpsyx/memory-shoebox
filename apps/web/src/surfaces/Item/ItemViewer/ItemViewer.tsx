import { useRef, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { ItemMediaColumn } from "./ItemMediaColumn";
import { VideoConversation } from "../VideoConversation/VideoConversation";
import { ItemConversation } from "../ItemConversation/ItemConversation";
import { ItemComments } from "../ItemConversation/ItemComments";
import { ItemTopBar } from "./ItemTopBar";
import { useVideoTransport } from "./useVideoTransport";
import { useWayBack } from "./useWayBack";

type Props = {
  detail: ItemDetail;
  /** The item being left, drawn while the next one loads: it takes no write. */
  isPlaceholder: boolean;
  viewer: Viewer;
  timezone: string;
};

/** Both media kinds use the same surface; photo siblings retain their focus. */
export function ItemViewer(props: Readonly<Props>): ReactNode {
  const { detail, viewer } = props;
  const wayBack = useWayBack(detail.capturedOn);
  const transport = useVideoTransport(detail.itemId);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <ItemTopBar capturedOn={detail.capturedOn} />
      {detail.kind === "video" ? (
        <VideoConversation
          key={detail.itemId}
          {...props}
          transport={transport}
          onDeleted={wayBack.leave}
        />
      ) : (
        <ItemConversation
          {...props}
          onDeleted={wayBack.leave}
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
      )}
    </>
  );
}
