import { Container } from "@videojs/react";
import { useState, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { VideoPlayback } from "./useVideoPlayback";
import type { VideoReactionsState } from "./useVideoReactions/useVideoReactions";
import { RegisteredVideo } from "./RegisteredVideo";
import { VideoPlaybackOverlay } from "./VideoPlaybackOverlay";
import { ConversationControls } from "./ConversationControls";
import classes from "./VideoConversation.module.css";

type Props = {
  detail: ItemDetail;
  transport: VideoTransport;
  playback: VideoPlayback;
  reactions: VideoReactionsState;
};

/** Video.js registers the native video, retaining WebM and MP4 fallback. */
export function ConversationPlayer({
  detail,
  transport,
  playback,
  reactions,
}: Readonly<Props>): ReactNode {
  const [retryVersion, setRetryVersion] = useState(0);
  const hasError =
    playback.hasError ||
    (detail.media.video?.webm == null && detail.media.video?.mp4 == null);
  return (
    <Container className={classes.player} aria-label="Video player">
      <RegisteredVideo
        key={`media-${retryVersion}`}
        media={detail.media}
        transport={transport}
        playback={playback}
      />
      <VideoPlaybackOverlay
        itemId={detail.itemId}
        playback={playback}
        transport={transport}
        hasError={hasError}
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
