import { isWebKitImageEncoder } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

/**
 * How long a tab may stay hidden before WebKit's videos go without a poster.
 *
 * WebKit presents no frames in a hidden tab, so its poster waits for the tab
 * to be shown. But the wait must never hold up the batch: once the tab has
 * been hidden this long, every WebKit video answers with no poster, its lane
 * carries on, and the file still uploads. A video original plays without a
 * poster, so a missing one is not a failure. **Measured from when the tab was
 * hidden, not per video**, so a batch of 32 pays it once rather than 16
 * times over on two lanes. Chrome never waits: its poster is drawn the same
 * hidden or not.
 */
export const HIDDEN_TAB_WAIT_MS = 15_000;

/**
 * When the tab was hidden, in `Date.now()` time; undefined while it is visible.
 */
let hiddenSinceMs: number | undefined = undefined;

/** Whether the listener that keeps `hiddenSinceMs` is installed yet. */
let isTrackingVisibility = false;

/**
 * Notes when the tab was hidden, and forgets it once the tab is shown.
 *
 * Read from `document.hidden` rather than from the event, so it is right
 * whichever way it is reached: by a `visibilitychange` or by a call that finds
 * the tab already hidden, in which case the count starts at that call.
 */
function _noteTabVisibility(): void {
  if (!document.hidden) {
    hiddenSinceMs = undefined;
  } else if (hiddenSinceMs === undefined) {
    hiddenSinceMs = Date.now();
  }
}

/** Starts noting the tab's visibility, once for the page's lifetime. */
function _trackTabVisibility(): void {
  _noteTabVisibility();
  if (!isTrackingVisibility) {
    isTrackingVisibility = true;
    document.addEventListener("visibilitychange", _noteTabVisibility);
  }
}

/**
 * Whether the document is visible, or becomes so within `timeoutMs`.
 *
 * Resolves true at once for a visible document, true when a hidden one is
 * shown, and false when it is still hidden after `timeoutMs` (at once, for
 * none left). Whichever way it ends, its listener and its timer are gone.
 */
function _waitUntilDocumentVisible(timeoutMs: number): Promise<boolean> {
  if (!document.hidden) {
    return Promise.resolve(true);
  }
  if (timeoutMs <= 0) {
    return Promise.resolve(false);
  }
  return new Promise((settle) => {
    const finish = (isVisible: boolean): void => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      settle(isVisible);
    };
    const onVisibilityChange = (): void => {
      if (!document.hidden) {
        finish(true);
      }
    };
    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
}

/**
 * Whether the tab is in a state to capture a poster in, waiting if need be.
 *
 * WebKit only: its tab presents no frames while hidden, so the work waits for
 * the tab to be shown, and the budget starts then. Chrome draws the same
 * hidden or not, so it is always ready. False means the tab has been hidden
 * past `HIDDEN_TAB_WAIT_MS`, and the video goes without a poster.
 */
export async function waitUntilReadyToCapture(): Promise<boolean> {
  _trackTabVisibility();
  if (!(await isWebKitImageEncoder())) {
    return true;
  }
  return _waitUntilDocumentVisible(
    hiddenSinceMs === undefined
      ? HIDDEN_TAB_WAIT_MS
      : Math.max(0, HIDDEN_TAB_WAIT_MS - (Date.now() - hiddenSinceMs)),
  );
}
