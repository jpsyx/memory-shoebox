import { VideoPlayer } from "@videojs/react/video";
import { useRef, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useVideoReactions } from "./useVideoReactions/useVideoReactions";
import { useVideoPlayback } from "./useVideoPlayback";
import { ConversationPlayer } from "./ConversationPlayer";
import { VideoReactionBar } from "./VideoReactionBar";
import { ItemComments } from "../ItemConversation/ItemComments";
import { ItemConversation } from "../ItemConversation/ItemConversation";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
  timezone: string;
  isPlaceholder: boolean;
  transport: VideoTransport;
  onDeleted: () => void;
};

/** The approved video conversation surface, retaining every ancillary item action. */
export function VideoConversation({
  detail,
  viewer,
  timezone,
  isPlaceholder,
  transport,
  onDeleted,
}: Readonly<Props>): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
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
            onComment={() => {
              fieldRef.current?.focus();
            }}
          />
        </div>
      }
      conversation={
        <ItemComments
          detail={detail}
          viewer={viewer}
          transport={transport}
          fieldRef={fieldRef}
          onSeek={(seconds) => {
            playback.seek(seconds);
          }}
        />
      }
    />
  );
}
