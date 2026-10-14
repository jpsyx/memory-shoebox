import { useLayoutEffect, useRef, type RefObject } from "react";
import type { MediaRef, MediaSource } from "@memory-shoebox/shared";

type Options = {
  itemId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  source: MediaSource | null;
  renew: () => Promise<MediaRef | undefined>;
};
/** Native playback checks, also used by application-driven seeking. */
export type VideoSourceRenewal = {
  beforePlay: () => Promise<void>;
  beforeSeek: () => Promise<void>;
  onSourceError: () => Promise<void>;
};
const RENEWALS = new WeakMap<HTMLVideoElement, VideoSourceRenewal>();
/** Retrieves the native node's lease check without coupling player controls. */
export function getSourceRenewalFromVideo(
  video: HTMLVideoElement,
): VideoSourceRenewal | undefined {
  return RENEWALS.get(video);
}

type PlaybackState = {
  time: number;
  paused: boolean;
  rate: number;
  volume: number;
  muted: boolean;
};
type State = {
  itemId: string;
  url: string | undefined;
  renditionId: string | undefined;
  video: HTMLVideoElement | null;
  failed: boolean;
  retrying?: Promise<void>;
  pending: Promise<void> | undefined;
  cancel: (() => void) | undefined;
  playback: PlaybackState | undefined;
};
function _capture(video: HTMLVideoElement): PlaybackState {
  return {
    time: video.currentTime,
    paused: video.paused,
    rate: video.playbackRate,
    volume: video.volume,
    muted: video.muted,
  };
}
function _restore(
  video: HTMLVideoElement,
  playback: Readonly<PlaybackState>,
): void {
  video.currentTime = Math.min(
    Math.max(0, playback.time),
    Number.isFinite(video.duration) ? video.duration : playback.time,
  );
  video.playbackRate = playback.rate;
  video.volume = playback.volume;
  video.muted = playback.muted;
  if (playback.paused) {
    video.pause();
  } else {
    void Promise.resolve(video.play()).catch(() => {
      /* Autoplay rejection is not a transport error. */
    });
  }
}
function _replace(
  state: State,
  video: HTMLVideoElement,
  source: MediaSource,
  force = false,
): Promise<void> {
  if (!force && state.url === source.url) {
    return state.pending ?? Promise.resolve();
  }
  const playback = state.playback ?? _capture(video);
  state.cancel?.();
  state.url = source.url;
  state.renditionId = source.renditionId;
  state.playback = playback;
  state.pending = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onFailure);
      state.cancel = undefined;
      state.pending = undefined;
      resolve();
    };
    const onReady = () => {
      if (video.currentSrc !== new URL(source.url, document.baseURI).href) {
        return;
      }
      cleanup();
      state.retrying = undefined;
      state.playback = undefined;
      _restore(video, playback);
    };
    const onFailure = () => {
      reject(new Error("Video source transport failed"));
      cleanup();
    };
    state.cancel = cleanup;
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onFailure);
    video.src = source.url;
    video.load();
  });
  return state.pending;
}
async function _renew(
  options: Readonly<Options>,
  state: State,
  force = false,
): Promise<void> {
  const video = options.videoRef.current;
  if (video === null) {
    return;
  }
  const previousUrl = state.url;
  const previousRenditionId = state.renditionId;
  const media = await options.renew();
  if (state.video !== video || state.itemId !== options.itemId) {
    return;
  }
  if (media?.playback === undefined || media.playback === null) {
    throw new Error("This video is no longer available");
  }
  if (
    state.renditionId !== previousRenditionId &&
    state.renditionId !== media.playback.renditionId
  ) {
    return;
  }
  await _replace(
    state,
    video,
    media.playback,
    force && previousUrl === media.playback.url && state.pending === undefined,
  );
}
function _retire(state: State, clearSource = false): void {
  state.cancel?.();
  const video = state.video;
  if (video !== null) {
    RENEWALS.delete(video);
    if (clearSource) {
      video.pause();
      video.removeAttribute("src");
      video.querySelectorAll("source").forEach((source) => {
        return source.removeAttribute("src");
      });
      video.load();
    }
  }
  state.video = null;
  state.playback = undefined;
}
function useCurrentSource(
  options: Readonly<Options>,
  state: State,
  renewal: VideoSourceRenewal,
): void {
  useLayoutEffect(() => {
    const video = options.videoRef.current;
    if (video === null) {
      _retire(state, true);
      return;
    }
    if (state.video !== video || state.itemId !== options.itemId) {
      _retire(state);
      state.video = video;
      state.itemId = options.itemId;
      state.url = options.source?.url;
      state.renditionId = options.source?.renditionId;
      state.failed = false;
      state.retrying = undefined;
    }
    RENEWALS.set(video, renewal);
    if (options.source !== null && state.url !== options.source.url) {
      void _replace(state, video, options.source).catch(() => {});
    }
  });
  useLayoutEffect(() => {
    return () => {
      _retire(state);
    };
  }, [state]);
}
async function _beforeUse(
  options: Readonly<Options>,
  state: State,
): Promise<void> {
  const video = state.video;
  const renditionId = state.renditionId;
  if (
    options.source !== null &&
    Date.parse(options.source.expiresAt) <= Date.now() + 60_000
  ) {
    await _renew(options, state);
  } else {
    await state.pending;
  }
  if (
    state.video !== video ||
    state.itemId !== options.itemId ||
    state.renditionId !== renditionId
  ) {
    throw new DOMException("Video selection changed", "AbortError");
  }
  const pending = state.pending;
  if (pending !== undefined) {
    await pending;
    if (
      state.video !== video ||
      state.itemId !== options.itemId ||
      state.renditionId !== renditionId
    ) {
      throw new DOMException("Video selection changed", "AbortError");
    }
  }
}
function useNativeUse(
  options: Readonly<Options>,
  latest: RefObject<Readonly<Options>>,
  state: State,
): void {
  useLayoutEffect(() => {
    const video = options.videoRef.current;
    if (video === null) {
      return;
    }
    const onUse = () => {
      const source = latest.current.source;
      if (
        source === null ||
        Date.parse(source.expiresAt) > Date.now() + 60_000 ||
        state.pending !== undefined
      ) {
        return;
      }
      state.playback ??= _capture(video);
      video.pause();
      void _beforeUse(latest.current, state).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          video.dispatchEvent(new Event("error"));
        }
      });
    };
    video.addEventListener("play", onUse);
    video.addEventListener("seeking", onUse);
    return () => {
      video.removeEventListener("play", onUse);
      video.removeEventListener("seeking", onUse);
    };
  }, [options.videoRef, latest, state]);
}
function _onSourceError(
  options: Readonly<Options>,
  state: State,
): Promise<void> {
  if (state.retrying !== undefined) {
    return state.retrying;
  }
  if (state.failed) {
    return Promise.reject(
      new Error("Video source failed again; explicit retry required"),
    );
  }
  state.failed = true;
  state.retrying = _renew(options, state, true).finally(() => {
    state.retrying = undefined;
  });
  return state.retrying;
}
/** Replaces only a changed lease, preserving intent and one failure retry chain. */
export function useVideoSourceRenewal(
  options: Readonly<Options>,
): VideoSourceRenewal {
  const state = useRef<State>({
    itemId: options.itemId,
    url: options.source?.url,
    renditionId: options.source?.renditionId,
    video: options.videoRef.current,
    failed: false,
    pending: undefined,
    cancel: undefined,
    playback: undefined,
  });
  const latest = useRef(options);
  latest.current = options;
  const check = () => {
    return _beforeUse(latest.current, state.current);
  };
  const renewal: VideoSourceRenewal = {
    beforePlay: check,
    beforeSeek: check,
    onSourceError: () => {
      return _onSourceError(latest.current, state.current);
    },
  };
  useCurrentSource(options, state.current, renewal);
  useNativeUse(options, latest, state.current);
  return renewal;
}
