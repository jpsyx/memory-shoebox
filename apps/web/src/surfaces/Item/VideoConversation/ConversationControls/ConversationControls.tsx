import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { CommentDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import type { VideoReactionsState } from "../useVideoReactions/useVideoReactions";
import { VideoControls } from "../VideoControls/VideoControls";
import { clsx } from "clsx";
import type { ItemPresentation } from "../../ItemViewer/ItemViewer.types";
import classes from "./ConversationControls.module.css";
import { VideoTimeline } from "../VideoTimeline/VideoTimeline";

type Props = {
  comments: readonly CommentDto[];
  transport: VideoTransport;
  playback: VideoPlayback;
  reactions: VideoReactionsState;
  hasError: boolean;
  presentation?: ItemPresentation;
  onEnterTheater: () => void;
};

/** Timeline and native player controls share a single position scale. */
export function ConversationControls({
  comments,
  transport,
  playback,
  reactions,
  hasError,
  presentation = "page",
  onEnterTheater,
}: Readonly<Props>): ReactNode {
  return (
    <div
      className={clsx(
        classes.conversationControls,
        presentation === "theater" && classes.theater,
      )}
      data-item-navigation-ignore
    >
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
        presentation={presentation}
        onEnterTheater={onEnterTheater}
        onFailure={() => {
          return playback.setHasError(true);
        }}
      />
    </div>
  );
}
