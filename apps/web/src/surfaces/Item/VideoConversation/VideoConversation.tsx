import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { VideoPlayer } from "@videojs/react/video";
import type { ReactNode, RefObject } from "react";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";
import type { TheaterCommentDockController } from "../ItemTheater/useTheaterCommentDock";
import { ItemComments } from "../ItemConversation/ItemComments/ItemComments";
import { ItemConversation } from "../ItemConversation/ItemConversation";
import { ConversationPlayer } from "./ConversationPlayer/ConversationPlayer";
import { useVideoPlayback } from "./useVideoPlayback/useVideoPlayback";
import { useVideoReactions } from "./useVideoReactions/useVideoReactions";
import { VideoReactionBar } from "./VideoReactionBar/VideoReactionBar";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  timezone: string;
  isPlaceholder: boolean;
  transport: VideoTransport;
  onDeleted: () => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  presentation: ItemPresentation;
  dockController: TheaterCommentDockController;
  onComment: () => void;
};

/**
 * The approved video conversation surface, retaining every ancillary item
 * action.
 */
export function VideoConversation({
  detail,
  viewer,
  timezone,
  isPlaceholder,
  transport,
  onDeleted,
  fieldRef,
  presentation,
  dockController,
  onComment,
}: Readonly<Props>): ReactNode {
  const reactions = useVideoReactions({
    itemId: detail.itemId,
    enabled: !isPlaceholder,
  });
  const playback = useVideoPlayback({
    media: detail.media,
    transport,
    reactions: reactions.reactions,
    lastAdded: reactions.lastAdded,
  });
  return (
    <ItemConversation
      detail={detail}
      viewer={viewer}
      timezone={timezone}
      isPlaceholder={isPlaceholder}
      onDeleted={onDeleted}
      presentation={presentation}
      dockController={dockController}
      media={
        <div inert={isPlaceholder}>
          <VideoPlayer>
            <ConversationPlayer
              detail={detail}
              transport={transport}
              playback={playback}
              reactions={reactions}
            />
          </VideoPlayer>
          <VideoReactionBar
            reactions={reactions}
            position={transport.position}
            canReact={detail.media.durationMs !== null && !isPlaceholder}
            onComment={onComment}
          />
        </div>
      }
      conversation={
        <ItemComments
          detail={detail}
          viewer={viewer}
          transport={transport}
          fieldRef={fieldRef}
          presentation={presentation}
          onSeek={(seconds) => {
            playback.seek({ seconds: seconds });
          }}
        />
      }
    />
  );
}
