/** One process-wide lane shared by capability checks and every heavy decoder. */
export type MediaDecodeCoordinator = {
  /** Waits abortably; active work retains the lane until it actually settles. */
  run: <Result>(
    work: () => Promise<Result>,
    signal: AbortSignal,
  ) => Promise<Result>;
};

/** Creates a FIFO lane without timers or work at construction time. */
export function createMediaDecodeCoordinator(): MediaDecodeCoordinator {
  let pending = Promise.resolve();
  return {
    run: async (work, signal) => {
      signal.throwIfAborted();
      let started = false;
      const result = pending.then(() => {
        signal.throwIfAborted();
        started = true;
        return work();
      });
      pending = result.then(
        () => {},
        () => {},
      );
      let onAbort = (): void => {};
      const interrupted = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          if (!started) {
            reject(signal.reason);
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        return await Promise.race([result, interrupted]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
