import { PlayButton } from "@videojs/react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { VideoPlayback } from "./useVideoPlayback";
import { VideoPlaybackError } from "./VideoPlaybackError";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  playback: VideoPlayback;
  transport: VideoTransport;
  hasError: boolean;
  onReload: () => void;
};

/** Playback entry and one authored reaction animation stay above the media. */
export function VideoPlaybackOverlay({
  itemId,
  playback,
  transport,
  hasError,
  onReload,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {!playback.isPlaying && !hasError ? (
        <PlayButton className={classes.centerPlay} label="Play video">
          <IconPlayerPlayFilled size={30} />
        </PlayButton>
      ) : null}
      {hasError ? (
        <VideoPlaybackError
          itemId={itemId}
          playback={playback}
          transport={transport}
          onReload={onReload}
        />
      ) : null}
      {playback.burst !== undefined ? (
        <div
          key={playback.burst.key}
          className={classes.reactionBurst}
          aria-hidden="true"
        >
          {playback.burst.emoji}
        </div>
      ) : null}
    </>
  );
}
