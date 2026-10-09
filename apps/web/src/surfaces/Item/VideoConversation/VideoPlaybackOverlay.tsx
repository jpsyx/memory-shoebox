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

/** An accessible playback target and reaction animation stay above the media. */
export function VideoPlaybackOverlay({
  itemId,
  playback,
  transport,
  hasError,
  onReload,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {!hasError ? (
        <PlayButton
          className={classes.playbackSurface}
          label={playback.isPlaying ? "Pause video" : "Play video"}
          onKeyUp={(event) => {
            if (event.key === " ") {
              // Video.js handles Space; suppress Chromium's extra native click.
              event.preventDefault();
            }
          }}
        >
          {!playback.isPlaying ? (
            <span className={classes.centerPlay} aria-hidden="true">
              <IconPlayerPlayFilled size={30} />
            </span>
          ) : null}
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
