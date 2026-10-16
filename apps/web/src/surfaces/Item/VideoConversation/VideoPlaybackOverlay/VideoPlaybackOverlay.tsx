import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { MediaRef } from "@memory-shoebox/shared";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { PlayButton } from "@videojs/react";
import type { KeyboardEvent, ReactNode } from "react";
import { onVideoPlay, onVideoPlayKey } from "../videoPlaybackHelpers";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import classes from "./VideoPlaybackOverlay.module.css";
import { VideoPlaybackError } from "../VideoPlaybackError/VideoPlaybackError";

type Props = {
  itemId: string;
  playback: VideoPlayback;
  transport: VideoTransport;
  hasError: boolean;
  onReload: () => void;
  renew: () => Promise<MediaRef | undefined>;
};

/**
 * An accessible playback target and reaction animation stay above the media.
 */
export function VideoPlaybackOverlay({
  itemId,
  playback,
  transport,
  hasError,
  onReload,
  renew,
}: Readonly<Props>): ReactNode {
  const onKeyCapture = (event: KeyboardEvent) => {
    onVideoPlayKey({
      event,
      video: transport.videoRef.current ?? undefined,
      onFailure: () => {
        playback.setHasError(true);
      },
    });
  };
  return (
    <>
      {!hasError ? (
        <PlayButton
          onClickCapture={(event) => {
            return onVideoPlay({
              event,
              video: transport.videoRef.current ?? undefined,
              onFailure: () => {
                return playback.setHasError(true);
              },
            });
          }}
          className={classes.videoPlaybackOverlaySurface}
          label={playback.isPlaying ? "Pause video" : "Play video"}
          onKeyDownCapture={onKeyCapture}
          onKeyUpCapture={onKeyCapture}
        >
          {!playback.isPlaying ? (
            <span
              className={classes.videoPlaybackOverlayCenterPlay}
              aria-hidden="true"
            >
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
          renew={renew}
        />
      ) : null}
      {playback.burst !== undefined ? (
        <div
          key={playback.burst.key}
          className={classes.videoPlaybackOverlayReactionBurst}
          aria-hidden="true"
        >
          {playback.burst.emoji}
        </div>
      ) : null}
    </>
  );
}
