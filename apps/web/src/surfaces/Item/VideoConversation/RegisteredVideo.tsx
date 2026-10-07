import { Video } from "@videojs/react/video";
import type { ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { VideoPlayback } from "./useVideoPlayback";
import { VideoSources } from "./VideoSources";

type Props = {
  media: MediaRef;
  transport: VideoTransport;
  playback: VideoPlayback;
};

/** Metadata edits retain playback; only explicit retry replaces the media node. */
export function RegisteredVideo({
  media,
  transport,
  playback,
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
        playback.setHasError(true);
      }}
    >
      <VideoSources
        media={media}
        onFailure={() => {
          playback.setHasError(true);
        }}
      />
    </Video>
  );
}
