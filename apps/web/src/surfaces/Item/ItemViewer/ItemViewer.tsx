import {
  PhotoReadinessContext,
  ViewerReadinessContext,
  type ViewerReadiness,
} from "@/media/PhotoReadinessContext";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import type { ItemDetail, MediaPreview } from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { ItemMediaColumn } from "./ItemMediaColumn";
import { VideoConversation } from "../VideoConversation/VideoConversation";
import { ItemConversation } from "../ItemConversation/ItemConversation";
import { ItemComments } from "../ItemConversation/ItemComments";
import { ItemTopBar } from "./ItemTopBar";
import { useVideoTransport, type VideoTransport } from "./useVideoTransport";
import { useWayBack } from "./useWayBack";
import { ItemNavigation } from "./ItemNavigation/ItemNavigation";

type Props = {
  detail: ItemDetail;
  selectedPreview?: MediaPreview;
  /** The item being left, drawn while the next one loads: it takes no write. */
  isPlaceholder: boolean;
  viewer: Viewer;
  timezone: string;
};

function _renderConversation({
  props,
  transport,
  onDeleted,
  fieldRef,
}: Readonly<{
  props: Readonly<Props>;
  transport: VideoTransport;
  onDeleted: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}>): ReactNode {
  return props.detail.kind === "video" && !props.isPlaceholder ? (
    <VideoConversation
      key={props.detail.itemId}
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
        <ItemComments
          detail={props.detail}
          viewer={props.viewer}
          fieldRef={fieldRef}
        />
      }
    />
  );
}

/** Both media kinds use the same surface; photo siblings retain their focus. */
export function ItemViewer(props: Readonly<Props>): ReactNode {
  const { detail, viewer } = props;
  const [readiness, setReadiness] = useState<ViewerReadiness>();
  const wayBack = useWayBack(detail.capturedOn);
  const transport = useVideoTransport(detail.itemId);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <PhotoReadinessContext value={setReadiness}>
      <ViewerReadinessContext value={readiness}>
        <ItemTopBar capturedOn={detail.capturedOn}>
          <ItemNavigation
            detail={detail}
            isPlaceholder={props.isPlaceholder}
            memberId={viewer.memberId}
          />
        </ItemTopBar>
        {_renderConversation({
          props,
          transport,
          onDeleted: wayBack.leave,
          fieldRef,
        })}
      </ViewerReadinessContext>
    </PhotoReadinessContext>
  );
}
