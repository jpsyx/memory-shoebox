import { useMediaLease } from "@/media/useMediaLease/useMediaLease";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Container } from "@videojs/react";
import { useState, type ReactNode } from "react";
import { ConversationControls } from "../ConversationControls/ConversationControls";
import { RegisteredVideo } from "../RegisteredVideo/RegisteredVideo";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import type { VideoReactionsState } from "../useVideoReactions/useVideoReactions";
import classes from "./ConversationPlayer.module.css";
import { VideoPlaybackOverlay } from "../VideoPlaybackOverlay/VideoPlaybackOverlay";

type Props = {
  detail: ItemDetail;
  transport: VideoTransport;
  playback: VideoPlayback;
  reactions: VideoReactionsState;
};

/** Video.js registers the native video, including original-only uploads. */
export function ConversationPlayer({
  detail,
  transport,
  playback,
  reactions,
}: Readonly<Props>): ReactNode {
  const lease = useMediaLease({
    itemId: detail.itemId,
    initialMedia: detail.media,
    purpose: "selected-view",
    isVisible: false,
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const hasError = playback.hasError;
  return (
    <Container
      className={classes.conversationPlayer}
      aria-label="Video player"
      data-item-navigation-ignore
      data-video-player
    >
      <RegisteredVideo
        key={`media-${retryVersion}`}
        itemId={detail.itemId}
        media={detail.media}
        transport={transport}
        playback={playback}
      />
      <VideoPlaybackOverlay
        itemId={detail.itemId}
        playback={playback}
        transport={transport}
        hasError={hasError}
        renew={lease.renew}
        onReload={() => {
          setRetryVersion((version) => {
            return version + 1;
          });
          transport.setPosition(0);
          playback.setIsPlaying(false);
        }}
      />
      <ConversationControls
        key={`controls-${retryVersion}`}
        comments={detail.comments}
        transport={transport}
        playback={playback}
        reactions={reactions}
        hasError={hasError}
      />
    </Container>
  );
}
