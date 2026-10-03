/*
 * The browser's own word on whether it has a network, for the transfer's
 * retries: a failure while offline is waited out, not retried.
 */

/**
 * Whether the browser says it has no network at all.
 *
 * Only `false` counts. `navigator.onLine` being true says nothing about
 * whether a request will get through, which is why a failure while it is true
 * keeps the ordinary backoff.
 */
export function isBrowserOffline(): boolean {
  return globalThis.navigator?.onLine === false;
}

/**
 * Waits for the browser's `online` event, at most `timeoutMs`.
 *
 * Resolves at once if the browser is already back, so an `online` that fired
 * between the failure and this call is not missed. Every listener and the
 * timer are let go of however it ends.
 *
 * @param options.signal Ends the wait early, as a timeout does.
 * @param options.timeoutMs The longest to wait.
 * @returns True when the browser came back, false when the wait ran out or
 *   was cancelled.
 */
export function waitForOnline(
  options: Readonly<{ signal: AbortSignal; timeoutMs: number }>,
): Promise<boolean> {
  const { signal } = options;
  if (signal.aborted) {
    return Promise.resolve(false);
  }
  if (!isBrowserOffline()) {
    return Promise.resolve(true);
  }
  return new Promise((settle) => {
    const finish = (isOnline: boolean) => {
      clearTimeout(timer);
      globalThis.removeEventListener("online", onOnline);
      signal.removeEventListener("abort", onAbort);
      settle(isOnline);
    };
    const onOnline = () => {
      finish(true);
    };
    const onAbort = () => {
      finish(false);
    };
    const timer = setTimeout(() => {
      finish(false);
    }, options.timeoutMs);
    globalThis.addEventListener("online", onOnline);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
