import { VideoPlayer } from "@videojs/react/video";
import { useRef, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { itemHeading } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { ItemMeta } from "@/surfaces/Item/ItemViewer/ItemMeta";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useVideoReactions } from "./useVideoReactions/useVideoReactions";
import { useVideoPlayback } from "./useVideoPlayback";
import { ConversationPlayer } from "./ConversationPlayer";
import { VideoReactionBar } from "./VideoReactionBar";
import { VideoComments } from "./VideoComments";
import { VideoDetails } from "./VideoDetails/VideoDetails";
import classes from "./VideoConversation.module.css";

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
    <main className={classes.videoPage} inert={isPlaceholder}>
      <div className={classes.surface}>
        <header className={classes.header}>
          <div>
            <h1>{itemHeading(detail)}</h1>
            <ItemMeta detail={detail} timezone={timezone} />
          </div>
          <VideoDetails
            detail={detail}
            viewer={viewer}
            timezone={timezone}
            transport={transport}
            isPlaceholder={isPlaceholder}
            onDeleted={onDeleted}
          />
        </header>
        <div className={classes.watchGrid}>
          <div className={classes.mediaColumn}>
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
          <VideoComments
            detail={detail}
            viewer={viewer}
            transport={transport}
            fieldRef={fieldRef}
            onSeek={(seconds) => {
              playback.seek(seconds, true);
            }}
          />
        </div>
      </div>
    </main>
  );
}
