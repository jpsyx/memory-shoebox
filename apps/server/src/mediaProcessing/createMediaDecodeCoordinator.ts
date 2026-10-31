/**
 * One process-wide lane shared by capability checks and every heavy decoder.
 */
export type MediaDecodeCoordinator = {
  /** Reserves an idle lane immediately; never queues a buffered request. */
  tryAcquire: () => (() => void) | undefined;
  /**
   * Waits abortably; active work retains the lane until it actually settles.
   */
  run: <Result>({
    work,
    signal,
  }: Readonly<{
    work: () => Promise<Result>;
    signal: AbortSignal;
  }>) => Promise<Result>;
};

type LaneState = { pending: Promise<void>; reservations: number };

function _tryAcquire(state: LaneState): (() => void) | undefined {
  if (state.reservations !== 0) {
    return undefined;
  }
  state.reservations += 1;
  const held = Promise.withResolvers<void>();
  state.pending = held.promise;
  let isReleased = false;
  return () => {
    if (!isReleased) {
      isReleased = true;
      state.reservations -= 1;
      held.resolve();
    }
  };
}

async function _run<Result>(
  state: LaneState,
  options: Readonly<{ work: () => Promise<Result>; signal: AbortSignal }>,
): Promise<Result> {
  const { work, signal } = options;
  signal.throwIfAborted();
  let started = false;
  state.reservations += 1;
  const result = state.pending
    .then(() => {
      signal.throwIfAborted();
      started = true;
      return work();
    })
    .finally(() => {
      state.reservations -= 1;
    });
  state.pending = result.then(
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
}

/** Creates a FIFO background lane with nonqueueing request admission. */
export function createMediaDecodeCoordinator(): MediaDecodeCoordinator {
  const state: LaneState = { pending: Promise.resolve(), reservations: 0 };
  return {
    tryAcquire: () => {
      return _tryAcquire(state);
    },
    run: (options) => {
      return _run(state, options);
    },
  };
}
