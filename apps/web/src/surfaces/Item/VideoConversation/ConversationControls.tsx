import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { CommentDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { VideoPlayback } from "./useVideoPlayback/useVideoPlayback";
import type { VideoReactionsState } from "./useVideoReactions/useVideoReactions";
import { VideoControls } from "./VideoControls";
import classes from "./VideoConversation.module.css";
import { VideoTimeline } from "./VideoTimeline";

type Props = {
  comments: readonly CommentDto[];
  transport: VideoTransport;
  playback: VideoPlayback;
  reactions: VideoReactionsState;
  hasError: boolean;
};

/** Timeline and native player controls share a single position scale. */
export function ConversationControls({
  comments,
  transport,
  playback,
  reactions,
  hasError,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.transport}>
      <VideoTimeline
        comments={comments}
        reactions={reactions}
        playback={playback}
        position={transport.position}
      />
      <VideoControls
        transport={transport}
        duration={playback.duration}
        hasError={hasError}
        onFailure={() => {
          return playback.setHasError(true);
        }}
      />
    </div>
  );
}
