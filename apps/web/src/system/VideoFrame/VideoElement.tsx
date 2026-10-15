import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { MediaRef } from "@memory-shoebox/shared";
import type { ReactNode, RefObject } from "react";

type Props = {
  media: MediaRef;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The element's own duration, once its metadata has loaded. */
  onDurationLoad: (seconds: number) => void;
  onPositionChange: (seconds: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
};

/**
 * The `<video>` itself: its poster, its sources, and the events the
 * transport follows. Never autoplays.
 */
export function VideoElement({
  media,
  videoRef,
  onDurationLoad,
  onPositionChange,
  onPlayingChange,
}: Readonly<Props>): ReactNode {
  if (media.playback === null) {
    return (
      <MediaPlaceholder
        altText={media.altText}
        width={media.width}
        height={media.height}
        state={media.previewState}
      />
    );
  }
  return (
    <video
      ref={videoRef}
      // The composed alt text, as a photograph's `<img>` carries it, so a
      // screen reader hears who is in the video rather than nothing.
      aria-label={media.altText}
      poster={media.poster?.url}
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        onDurationLoad(event.currentTarget.duration);
      }}
      onTimeUpdate={(event) => {
        return onPositionChange(event.currentTarget.currentTime);
      }}
      onPlay={() => {
        return onPlayingChange(true);
      }}
      onPause={() => {
        return onPlayingChange(false);
      }}
    >
      {media.playback === null ? null : (
        <source src={media.playback.url} type={media.playback.contentType} />
      )}
    </video>
  );
}
