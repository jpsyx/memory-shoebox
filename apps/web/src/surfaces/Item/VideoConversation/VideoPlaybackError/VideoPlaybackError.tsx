import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { MediaRef } from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import classes from "./VideoPlaybackError.module.css";

type Props = {
  itemId: string;
  playback: VideoPlayback;
  transport: VideoTransport;
  onReload: () => void;
  renew: () => Promise<MediaRef | undefined>;
};

/** An explicit retry also refreshes signed media URLs that may have expired. */
export function VideoPlaybackError({
  playback,
  renew,
  onReload,
}: Readonly<Props>): ReactNode {
  const [isRetrying, setIsRetrying] = useState(false);
  return (
    <div className={classes.videoPlaybackError} role="alert">
      <strong>This video couldn’t play</strong>
      <button
        type="button"
        aria-busy={isRetrying}
        aria-disabled={isRetrying}
        onClick={() => {
          if (isRetrying) {
            return;
          }
          setIsRetrying(true);
          void renew().then(
            (media) => {
              if (media?.playback == null) {
                setIsRetrying(false);
                playback.setHasError(true);
                return;
              }
              playback.setHasError(false);
              onReload();
              setIsRetrying(false);
            },
            () => {
              setIsRetrying(false);
              playback.setHasError(true);
            },
          );
        }}
      >
        Try again
      </button>
    </div>
  );
}
