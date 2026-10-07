import { VideoPlayer } from "@videojs/react/video";
import { useRef, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { itemHeading } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { ItemMeta } from "@/surfaces/Item/ItemViewer/ItemMeta";
import { ItemSheets } from "@/surfaces/Item/ItemViewer/ItemSheets";
import { ItemReactions } from "@/surfaces/Item/ItemViewer/ItemReactions/ItemReactions";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useVideoReactions } from "./useVideoReactions/useVideoReactions";
import { useVideoPlayback } from "./useVideoPlayback";
import { ConversationPlayer } from "./ConversationPlayer";
import { VideoReactionTray } from "./VideoReactionTray";
import { VideoComments } from "./VideoComments";
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
          <h1>{itemHeading(detail)}</h1>
          <ItemMeta detail={detail} timezone={timezone} />
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
            <VideoReactionTray
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
      <div className={classes.details}>
        <ItemReactions detail={detail} viewer={viewer} />
        <ItemSheets
          detail={detail}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          isPlaceholder={isPlaceholder}
          onDeleted={onDeleted}
          includeTalk={false}
        />
      </div>
    </main>
  );
}
