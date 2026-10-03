import type { ReactNode, RefObject } from "react";
import type { MediaRef } from "@memory-shoebox/shared";

type Props = {
  media: MediaRef;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The element's own duration, once its metadata has loaded. */
  onDurationLoad: (seconds: number) => void;
  onPositionChange: (seconds: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
};

/** The two encodings the contract carries, in preference order. */
function _sourcesOf(
  media: MediaRef,
): ReadonlyArray<{ readonly url: string; readonly type: string }> {
  if (media.video === null) {
    return [];
  }
  return [
    { source: media.video.webm, type: "video/webm" },
    { source: media.video.mp4, type: "video/mp4" },
  ].flatMap((candidate) => {
    return candidate.source === null
      ? []
      : [{ url: candidate.source.url, type: candidate.type }];
  });
}

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
      {_sourcesOf(media).map((source) => {
        return <source key={source.url} src={source.url} type={source.type} />;
      })}
    </video>
  );
}
