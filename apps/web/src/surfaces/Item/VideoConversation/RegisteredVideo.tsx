import { useMediaLease } from "@/media/useMediaLease";
import { useMediaSourceOwnership } from "@/media/useMediaSourceOwnership";
import {
  useVideoSourceRenewal,
  type VideoSourceRenewal,
} from "./useVideoSourceRenewal";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { Video } from "@videojs/react/video";
import { useContext, type ReactNode } from "react";
import { PhotoReadinessContext } from "@/media/PhotoReadinessContext";
import { useVideoReadiness } from "@/media/useVideoReadiness";
import type { MediaRef } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import type { VideoPlayback } from "./useVideoPlayback";
import { VideoSources } from "./VideoSources";

type Props = {
  itemId: string;
  media: MediaRef;
  transport: VideoTransport;
  playback: VideoPlayback;
};

/** Metadata edits retain playback; only explicit retry replaces the media node. */
export function RegisteredVideo({
  itemId,
  media: initialMedia,
  transport,
  playback,
}: Readonly<Props>): ReactNode {
  const lease = useMediaLease({
    itemId,
    initialMedia,
    purpose: "selected-view",
    isVisible: true,
  });
  const media = lease.media ?? {
    ...initialMedia,
    playback: null,
    poster: null,
    thumb: null,
  };
  const renewal = useVideoSourceRenewal({
    itemId,
    videoRef: transport.videoRef,
    source: media.playback,
    renew: lease.renew,
  });
  useMediaSourceOwnership({
    itemId,
    source: media.poster ?? media.thumb ?? undefined,
  });
  const onReady = useContext(PhotoReadinessContext);
  useVideoReadiness({
    itemId,
    enabled: media.playback !== null,
    videoRef: transport.videoRef,
    onReady,
  });
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
  return _renderVideo({ media, transport, playback, renewal });
}

function _renderVideo({
  media,
  transport,
  playback,
  renewal,
}: Readonly<
  Omit<Props, "itemId"> & { renewal: VideoSourceRenewal }
>): ReactNode {
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
