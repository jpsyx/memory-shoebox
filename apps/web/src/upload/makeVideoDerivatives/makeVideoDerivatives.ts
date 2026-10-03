import { appConfig } from "../../../../../app.config";
import {
  getJpegQualityFromEncoder,
  getTargetSizeFromLongEdge,
  isWebKitImageEncoder,
  makeJpegFromSource,
  type MadeDerivative,
  type PixelSize,
} from "@/upload/jpegDerivatives/jpegDerivatives";

/** What `makeVideoDerivatives` hands back to the engine. */
export type VideoDerivativesResult = {
  derivatives: MadeDerivative[];
  /** The decoder's own size, which already includes the track's rotation. */
  size: PixelSize | null;
};

/**
 * How long one video may take, start to finish, before it gets no poster.
 *
 * A codec this browser cannot decode usually fails fast with an `error`
 * event, but not always: some stall at `loadedmetadata` forever. Twenty
 * seconds is ten times the slowest poster the spike measured, the 533 MB file
 * on WebKit included, so only a video that was never going to decode meets it.
 */
const POSTER_TIMEOUT_MS = 20_000;

/**
 * How long to wait for a presented frame after `seeked`.
 *
 * The spike's figure. WebKit presents the sought frame well inside it; Chrome
 * never calls back on a paused seek, so for Chrome this is simply the delay
 * before drawing a frame that was already correct.
 */
const FRAME_WAIT_MS = 500;

/** The latest a poster frame is taken from: one second in, or sooner. */
const POSTER_SEEK_CAP_SECONDS = 1;

/** What a video that gets no poster answers. */
const NO_POSTER: VideoDerivativesResult = { derivatives: [], size: null };

/**
 * Where to take the poster from: a tenth of the way in, never past 1 s.
 *
 * A tenth, so a two-second clip does not show its last frame; never past one
 * second, so a long video's poster is its opening rather than a minute in,
 * and the seek stays cheap. A duration the browser cannot state (a live or
 * broken stream reads as `Infinity` or `NaN`) takes the first frame.
 */
export function getPosterSeekSecondsFromDuration(
  durationSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.min(POSTER_SEEK_CAP_SECONDS, durationSeconds / 10);
}

/** The poster at the display edge and the thumb at the thumb edge. */
export function getVideoDerivativeSizesFromSize(size: Readonly<PixelSize>): {
  poster: PixelSize;
  thumb: PixelSize;
} {
  return {
    poster: getTargetSizeFromLongEdge({
      ...size,
      longEdgePx: appConfig.upload.derivatives.displayLongEdgePx,
    }),
    thumb: getTargetSizeFromLongEdge({
      ...size,
      longEdgePx: appConfig.upload.derivatives.thumbLongEdgePx,
    }),
  };
}

/**
 * Resolves once the sought frame has been presented, or after `timeoutMs`.
 *
 * **Both, because the two engines disagree** (finding 4). WebKit has not yet
 * painted the sought frame when `seeked` fires, so drawing then gives black;
 * `requestVideoFrameCallback` fires once it has. Chrome never fires that
 * callback for a paused seek, but its `seeked` frame is already correct, so
 * the timeout is what lets Chrome go on. A browser without the callback at
 * all takes the timeout too.
 */
export function waitForPresentedFrame(
  video: Readonly<
    Partial<
      Pick<
        HTMLVideoElement,
        "requestVideoFrameCallback" | "cancelVideoFrameCallback"
      >
    >
  >,
  timeoutMs: number,
): Promise<"frame" | "timeout"> {
  return new Promise((settle) => {
    // The timer is set first so a callback that fires at once can clear it;
    // `handle` is only read when the timer fires, by which time it is set.
    const timer = setTimeout(() => {
      if (handle !== undefined) {
        video.cancelVideoFrameCallback?.(handle);
      }
      settle("timeout");
    }, timeoutMs);
    const handle = video.requestVideoFrameCallback?.(() => {
      clearTimeout(timer);
      settle("frame");
    });
  });
}

/** Resolves on `eventName`, rejects on the element's `error`. */
function _waitForMediaEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
): Promise<void> {
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
 * A container that keeps the video in the document, and out of sight.
 *
 * In the document because a frame is only presented to the compositor for an
 * element that is rendered, and WebKit's callback waits for exactly that; a
 * detached `<video>` never calls back. Four pixels at almost no opacity, the
 * spike's own arrangement, so nothing ever flashes on screen.
 */
function _attachHiddenVideo(video: HTMLVideoElement): HTMLDivElement {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:0;top:0;width:4px;height:4px;overflow:hidden;opacity:0.01;pointer-events:none";
  container.append(video);
  document.body.append(container);
  return container;
}

/** Seeks to the poster frame, then makes the poster and the thumb from it. */
async function _capturePoster(
  video: HTMLVideoElement,
): Promise<VideoDerivativesResult> {
  await _waitForMediaEvent(video, "loadedmetadata");
  const size = { width: video.videoWidth, height: video.videoHeight };
  if (size.width === 0 || size.height === 0) {
    return NO_POSTER;
  }
  const seeked = _waitForMediaEvent(video, "seeked");
  video.currentTime = getPosterSeekSecondsFromDuration(video.duration);
  await seeked;
  await waitForPresentedFrame(video, FRAME_WAIT_MS);
  const sizes = getVideoDerivativeSizesFromSize(size);
  const quality = getJpegQualityFromEncoder(await isWebKitImageEncoder());
  const poster = await makeJpegFromSource({
    source: video,
    size: sizes.poster,
    quality,
  });
  const thumb = await makeJpegFromSource({
    source: video,
    size: sizes.thumb,
    quality,
  });
  const derivatives = [
    { purpose: "poster" as const, blob: poster, ...sizes.poster },
    { purpose: "thumb" as const, blob: thumb, ...sizes.thumb },
  ].flatMap((made) => {
    return made.blob === null ? [] : [{ ...made, blob: made.blob }];
  });
  return { derivatives, size };
}

/**
 * A video's `poster` and `thumb` JPEGs, made on the main thread.
 *
 * On the main thread because a worker has no `<video>`. The recipe is the
 * spike's, the one that drew an upright poster for all 32 of its videos in
 * both engines: a muted, inline `<video>` on an object URL, seek to
 * `getPosterSeekSecondsFromDuration`, wait for `seeked` and then for
 * whichever comes first of a presented frame and a short timeout, and draw.
 * The decoder applies the track's rotation, so the size it reports is the
 * displayed one and is what `complete` sends as the video's size.
 *
 * **It never hangs and never throws.** A codec the browser cannot decode,
 * an error event, or `POSTER_TIMEOUT_MS` passing all answer with no
 * derivatives, and the video uploads with only its original (Ruling 1). The
 * object URL is revoked and the element removed whichever way it ends.
 *
 * Only the pure parts run in a unit test: jsdom has no media pipeline and no
 * `URL.createObjectURL`. The real behaviour is `e2e/upload.spec.ts`'s
 * (Task 31), in Chrome and in WebKit.
 *
 * @param file The picked video.
 * @returns The derivatives made, possibly none, and the displayed size.
 */
export async function makeVideoDerivatives(
  file: Blob,
): Promise<VideoDerivativesResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  const container = _attachHiddenVideo(video);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<VideoDerivativesResult>((settle) => {
    timer = setTimeout(() => {
      settle(NO_POSTER);
    }, POSTER_TIMEOUT_MS);
  });
  const captured = _capturePoster(video).catch(() => {
    return NO_POSTER;
  });
  video.src = url;
  try {
    return await Promise.race([captured, timedOut]);
  } finally {
    clearTimeout(timer);
    video.removeAttribute("src");
    video.load();
    container.remove();
    URL.revokeObjectURL(url);
  }
}
