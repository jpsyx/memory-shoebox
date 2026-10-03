import type { VideoDerivativesResult } from "./makeVideoDerivativesFromFile.types";

import { waitUntilReadyToCapture } from "./waitUntilReadyToCapture";

import { attachHiddenVideo, capturePoster } from "./capturePosterHelpers";

import { POSTER_TIMEOUT_MS } from "./makeVideoDerivativesFromFile.constants";

import { makeNoPoster } from "./makeNoPoster";

/**
 * A video's `poster` and `thumb` JPEGs, made on the main thread.
 *
 * On the main thread because a worker has no `<video>`. The decoder applies the
 * track's rotation, so the size it reports is the displayed one and is what
 * `complete` sends as the video's size.
 *
 * **It never throws and never hangs.** A codec the browser cannot decode, an
 * error event, an unsuitable frame (`isPosterFrameDrawable`), or
 * `POSTER_TIMEOUT_MS` passing all answer with no derivatives, and the video
 * uploads with only its original (Ruling 1). The object URL is revoked and the
 * element removed whichever way it ends, and a capture that lost to the timeout
 * stops before its next encode. A hidden tab presents no frames in WebKit, so
 * there the work waits for the tab to be shown (and the budget starts then),
 * but only until the tab has been hidden for `HIDDEN_TAB_WAIT_MS`: past that,
 * every video goes without a poster rather than hold up the batch. Chrome does
 * not wait.
 *
 * @param file The picked video.
 * @returns The derivatives made, possibly none, and the displayed size.
 */
export async function makeVideoDerivativesFromFile(
  file: Blob,
): Promise<VideoDerivativesResult> {
  // The size is not known yet, so a tab that stays hidden past the cap
  // answers without one.
  if (!(await waitUntilReadyToCapture())) {
    return makeNoPoster(undefined);
  }
  const abort = new AbortController();
  let url: string | undefined;
  let video: HTMLVideoElement | undefined;
  let container: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    url = URL.createObjectURL(file);
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    container = attachHiddenVideo(video);
    const timedOut = new Promise<VideoDerivativesResult>((settle) => {
      timer = setTimeout(() => {
        settle(makeNoPoster(undefined));
      }, POSTER_TIMEOUT_MS);
    });
    const captured = capturePoster({
      video: video,
      signal: abort.signal,
    }).catch(() => {
      return makeNoPoster(undefined);
    });
    video.src = url;
    return await Promise.race([captured, timedOut]);
  } catch {
    return makeNoPoster(undefined);
  } finally {
    // Tells a capture that lost the race to stop before its next encode.
    abort.abort();
    clearTimeout(timer);
    video?.removeAttribute("src");
    video?.load();
    container?.remove();
    if (url !== undefined) {
      URL.revokeObjectURL(url);
    }
  }
}
