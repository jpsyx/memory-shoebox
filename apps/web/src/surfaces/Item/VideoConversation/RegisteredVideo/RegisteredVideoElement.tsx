import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { MediaRef } from "@memory-shoebox/shared";
import { Video } from "@videojs/react/video";
import type { ReactNode } from "react";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import type { VideoSourceRenewal } from "../videoSourceRenewalHelpers/videoSourceRenewalHelpers";
import { VideoSources } from "../VideoSources";

type Props = {
  media: MediaRef;
  transport: VideoTransport;
  playback: VideoPlayback;
  renewal: VideoSourceRenewal;
};

/**
 * Retains the owned native video ref and playback bindings across media
 * renewal.
 */
export function RegisteredVideoElement({
  media,
  transport,
  playback,
  renewal,
}: Readonly<Props>): ReactNode {
  return (
    <Video
      ref={transport.videoRef}
      aria-label={media.altText}
      poster={media.poster?.url}
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        playback.onLoaded(event.currentTarget);
      }}
      onTimeUpdate={(event) => {
        playback.onTimeUpdate(event.currentTarget);
      }}
      onPlay={() => {
        playback.setIsPlaying(true);
      }}
      onPause={() => {
        playback.setIsPlaying(false);
      }}
      onEnded={() => {
        playback.setIsPlaying(false);
      }}
      onSeeking={playback.onSeeking}
      onSeeked={playback.onSeeked}
      onError={() => {
        void renewal.onSourceError().catch(() => {
          playback.setHasError(true);
        });
      }}
    >
      <VideoSources
        media={media}
        onFailure={() => {
          void renewal.onSourceError().catch(() => {
            playback.setHasError(true);
          });
        }}
      />
    </Video>
  );
}
