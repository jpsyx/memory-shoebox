import { appConfig } from "../../../../../app.config";

import {
  getTargetSizeFromLongEdge,
  type PixelSize,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

/** The latest a poster frame is taken from: one second in, or sooner. */
const POSTER_SEEK_CAP_SECONDS = 1;

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
  functionOptions: Readonly<{
    video: Readonly<
      Partial<
        Pick<
          HTMLVideoElement,
          "requestVideoFrameCallback" | "cancelVideoFrameCallback"
        >
      >
    >;
    timeoutMs: number;
  }>,
): Promise<"frame" | "timeout"> {
  const { video, timeoutMs } = functionOptions;

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

/**
 * Whether the frame the video shows is one to draw a poster from.
 *
 * **No poster is better than a black one**, and there are three ways to get
 * a black or blank frame. A video with no frame yet (`readyState` below
 * `HAVE_CURRENT_DATA`: a slow 4K decode, a stalled one) has nothing to draw.
 * And WebKit, which has not painted the sought frame at `seeked`, answers
 * the frame callback once it has: so when the wait ended on the timeout
 * instead (a hidden tab never calls back, nor does a decode that is still
 * running) the frame is the known black one. Chrome never calls back on a
 * paused seek, but its `seeked` frame is already right, so for Chrome the
 * timeout is the normal way for the wait to end and it draws.
 *
 * WebKit is told by `isWebKitImageEncoder`, the same feature test that picks
 * the JPEG quality: it identifies the engine rather than the brand, so every
 * browser on iOS, which is WebKit underneath, is caught.
 */
export function isPosterFrameDrawable(
  options: Readonly<{
    waitedFor: "frame" | "timeout";
    isWebKitEncoder: boolean;
    readyState: number;
  }>,
): boolean {
  return options.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ? false
    : options.waitedFor === "frame" || !options.isWebKitEncoder;
}
