import {
  getJpegQualityFromEncoder,
  isWebKitImageEncoder,
  makeJpegFromSource,
  type MadeDerivative,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import type {
  MakeDerivativeFromVideoOptions,
  VideoDerivativesResult,
} from "./makeVideoDerivativesFromFile.types";

import { makeNoPoster } from "./makeNoPoster";

import {
  getPosterSeekSecondsFromDuration,
  waitForPresentedFrame,
  isPosterFrameDrawable,
  getVideoDerivativeSizesFromSize,
} from "./videoPosterFrameHelpers";

/**
 * How long to wait for a presented frame after `seeked`.
 *
 * The spike's figure. WebKit presents the sought frame well inside it; Chrome
 * never calls back on a paused seek, so for Chrome this is simply the delay
 * before drawing a frame that was already correct.
 */
const FRAME_WAIT_MS = 500;

/** Resolves on `eventName`, rejects on the element's `error`. */
function _waitForMediaEvent(
  functionOptions: Readonly<{
    video: HTMLVideoElement;
    eventName: "loadedmetadata" | "seeked";
  }>,
): Promise<void> {
  const { video, eventName } = functionOptions;

  return new Promise((settle, fail) => {
    const onError = (): void => {
      video.removeEventListener(eventName, onEvent);
      fail(new Error(`Video error ${video.error?.code ?? "unknown"}`));
    };
    const onEvent = (): void => {
      video.removeEventListener("error", onError);
      settle();
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

/**
 * Returns a container that keeps the video rendered in the document but out of
 * sight.
 *
 * WebKit presents a frame only for a rendered element; a detached video never
 * receives its presented-frame callback.
 */
export function attachHiddenVideo(video: HTMLVideoElement): HTMLDivElement {
  // Keep the rendered element four pixels wide at almost zero opacity so it
  // never
  // flashes on screen.

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:0;top:0;width:4px;height:4px;overflow:hidden;opacity:0.01;pointer-events:none";
  container.append(video);
  document.body.append(container);
  return container;
}

/** One JPEG of the video's frame, or none: not after `signal` is aborted. */
async function _makeDerivativeFromVideo(
  options: MakeDerivativeFromVideoOptions,
): Promise<MadeDerivative[]> {
  if (options.signal.aborted) {
    return [];
  }
  const blob = await makeJpegFromSource({
    source: options.video,
    size: options.size,
    quality: options.quality,
  });
  return blob === undefined
    ? []
    : [{ purpose: options.purpose, blob, ...options.size }];
}

/**
 * Returns poster and thumb JPEGs with the displayed video size, or no
 * derivatives when no drawable frame is available.
 */
export async function capturePoster(
  functionOptions: Readonly<{ video: HTMLVideoElement; signal: AbortSignal }>,
): Promise<VideoDerivativesResult> {
  // Seek to the poster frame before capturing its derivatives.

  const { video, signal } = functionOptions;

  await _waitForMediaEvent({ video: video, eventName: "loadedmetadata" });
  const size = { width: video.videoWidth, height: video.videoHeight };
  if (size.width === 0 || size.height === 0) {
    return makeNoPoster(undefined);
  }
  const seeked = _waitForMediaEvent({ video, eventName: "seeked" });
  video.currentTime = getPosterSeekSecondsFromDuration(video.duration);
  await seeked;
  const waitedFor = await waitForPresentedFrame({
    video,
    timeoutMs: FRAME_WAIT_MS,
  });
  const isWebKitEncoder = await isWebKitImageEncoder();
  const readyState = video.readyState;
  if (!isPosterFrameDrawable({ waitedFor, isWebKitEncoder, readyState })) {
    return makeNoPoster(size);
  }
  const sizes = getVideoDerivativeSizesFromSize(size);
  const quality = getJpegQualityFromEncoder(isWebKitEncoder);
  const poster = await _makeDerivativeFromVideo({
    purpose: "poster",
    size: sizes.poster,
    video,
    quality,
    signal,
  });
  const thumb = await _makeDerivativeFromVideo({
    purpose: "thumb",
    size: sizes.thumb,
    video,
    quality,
    signal,
  });
  return { derivatives: [...poster, ...thumb], size };
}
