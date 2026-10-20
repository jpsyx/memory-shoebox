import { PhotoReadinessContext } from "@/media/PhotoReadinessContext";
import { useMediaLease } from "@/media/useMediaLease/useMediaLease";
import { useMediaSourceOwnership } from "@/media/useMediaSourceOwnership";
import { useVideoReadiness } from "@/media/useVideoReadiness/useVideoReadiness";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { MediaRef } from "@memory-shoebox/shared";
import { useTheaterVideoPlayback } from "../../ItemTheater/useTheaterVideoPlayback/useTheaterVideoPlayback";
import type { ItemPresentation } from "../../ItemViewer/ItemViewer.types";
import { useContext, useRef, type ReactNode, type RefObject } from "react";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import { useVideoSourceRenewal } from "../videoSourceRenewalHelpers/videoSourceRenewalHelpers";
import { RegisteredVideoElement } from "./RegisteredVideoElement";

type Props = {
  itemId: string;
  media: MediaRef;
  transport: VideoTransport;
  playback: VideoPlayback;
  presentation?: ItemPresentation;
  playbackPreferences?: RefObject<{ isMuted: boolean }>;
};

/**
 * Metadata edits retain playback; only explicit retry replaces the media node.
 */
export function RegisteredVideo({
  itemId,
  media: initialMedia,
  transport,
  playback,
  presentation = "page",
  playbackPreferences,
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
    source: media.playback ?? undefined,
    renew: lease.renew,
  });
  const defaultPreferences = useRef({ isMuted: false });
  useTheaterVideoPlayback({
    itemId,
    presentation,
    transport,
    playback,
    preferences: playbackPreferences ?? defaultPreferences,
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
  return media.playback === null ? (
    <MediaPlaceholder
      altText={media.altText}
      width={media.width}
      height={media.height}
      state={media.previewState}
    />
  ) : (
    <RegisteredVideoElement
      media={media}
      transport={transport}
      playback={playback}
      renewal={renewal}
    />
  );
}
