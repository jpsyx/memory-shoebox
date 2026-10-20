import { useLayoutEffect, useRef, type RefObject } from "react";
import { playVideo } from "@/system/VideoFrame/playVideo";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";
import type { VideoTransport } from "../ItemViewer/useVideoTransport";
import type { VideoPlayback } from "../VideoConversation/useVideoPlayback/useVideoPlayback";
import { getSourceRenewalFromVideo } from "../VideoConversation/videoSourceRenewalHelpers/videoSourceRenewalHelpers";

type Options = {
  itemId: string;
  presentation: ItemPresentation;
  transport: VideoTransport;
  playback: VideoPlayback;
  preferences: RefObject<{ isMuted: boolean }>;
};
type Owner = {
  itemId: string;
  video: HTMLVideoElement | null;
  presentation: ItemPresentation;
  cancel: (() => void) | undefined;
  forgetVolume: (() => void) | undefined;
};
function _attemptPlayback({
  video,
  playback,
  transport,
}: Readonly<{
  video: HTMLVideoElement;
  playback: VideoPlayback;
  transport: VideoTransport;
}>): () => void {
  const renewal = getSourceRenewalFromVideo(video);
  let isActive = true;
  if (renewal !== undefined && !playback.hasError) {
    const isCurrent = renewal.selectPlayback(true);
    void renewal
      .beforePlay()
      .then(() => {
        if (
          isActive &&
          isCurrent() &&
          transport.videoRef.current === video &&
          video.paused
        ) {
          playVideo(video);
        }
      })
      .catch((error: unknown) => {
        if (
          isActive &&
          isCurrent() &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          playback.setHasError(true);
        }
      });
  }
  return () => {
    isActive = false;
  };
}
function _watchNativePreferences({
  video,
  preferences,
}: Readonly<{
  video: HTMLVideoElement | null;
  preferences: Options["preferences"];
}>): (() => void) | undefined {
  if (video === null) {
    return undefined;
  }
  video.playbackRate = 1;
  video.muted = preferences.current.isMuted;
  const onVolumeChange = () => {
    preferences.current.isMuted = video.muted;
  };
  video.addEventListener("volumechange", onVolumeChange);
  return () => {
    video.removeEventListener("volumechange", onVolumeChange);
  };
}
function _syncPlaybackOwner(owner: Owner, options: Readonly<Options>): void {
  const { itemId, presentation, transport, playback, preferences } = options;
  const video = transport.videoRef.current;
  const hasChangedNode = owner.video !== video || owner.itemId !== itemId;
  const hasEntered =
    owner.presentation !== "theater" && presentation === "theater";
  const hasExited =
    owner.presentation === "theater" && presentation !== "theater";
  if (hasChangedNode || hasExited) {
    owner.cancel?.();
  }
  if (hasChangedNode) {
    owner.forgetVolume?.();
    owner.forgetVolume = _watchNativePreferences({ video, preferences });
  }
  owner.video = video;
  owner.itemId = itemId;
  owner.presentation = presentation;
  if (hasExited) {
    transport.pause();
  }
  if (
    presentation === "theater" &&
    video !== null &&
    (hasEntered || hasChangedNode)
  ) {
    owner.cancel = _attemptPlayback({ video, playback, transport });
  }
}

/**
 * One intent per theater entry/playable node, using the native renewal gate.
 * Native controls remain authoritative for mute, pause and playback position.
 */
export function useTheaterVideoPlayback(options: Readonly<Options>): void {
  const owner = useRef<Owner>({
    itemId: options.itemId,
    video: null,
    presentation: "page",
    cancel: undefined,
    forgetVolume: undefined,
  }).current;
  useLayoutEffect(() => {
    _syncPlaybackOwner(owner, options);
  });
  useLayoutEffect(() => {
    return () => {
      owner.cancel?.();
      owner.forgetVolume?.();
      // Effect recreation must re-register the same committed native node.
      owner.video = null;
    };
  }, [owner]);
}
