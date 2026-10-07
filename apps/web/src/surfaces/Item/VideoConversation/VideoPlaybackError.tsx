import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { itemQueryOptions } from "@/api/items/items";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { VideoPlayback } from "./useVideoPlayback";
import classes from "./VideoConversation.module.css";

type Props = {
  itemId: string;
  playback: VideoPlayback;
  transport: VideoTransport;
  onReload: () => void;
};

/** An explicit retry also refreshes signed media URLs that may have expired. */
export function VideoPlaybackError({
  itemId,
  playback,
  onReload,
}: Readonly<Props>): ReactNode {
  const queryClient = useQueryClient();
  const [isRetrying, setIsRetrying] = useState(false);
  return (
    <div className={classes.mediaError} role="alert">
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
          void queryClient
            .refetchQueries(
              { queryKey: itemQueryOptions(itemId).queryKey, exact: true },
              { throwOnError: true },
            )
            .then(
              () => {
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
