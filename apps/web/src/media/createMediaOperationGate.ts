import { appConfig } from "../../../../app.config";

/** Coordinates speculative metadata and byte operations across owners. */
export type MediaOperationGate = {
  /** Queued aborts never start; active aborts wait for real settlement. */
  run: <T>(signal: AbortSignal, operation: () => Promise<T>) => Promise<T>;
};

type GateState = { active: number; waiting: Set<() => void> };

function _acquire(state: GateState, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      state.waiting.delete(start);
      reject(signal.reason);
    };
    const start = () => {
      state.waiting.delete(start);
      signal.removeEventListener("abort", onAbort);
      state.active += 1;
      resolve();
    };
    if (signal.aborted) {
      reject(signal.reason);
    } else if (state.active < appConfig.media.prefetch.maxOperations) {
      start();
    } else {
      state.waiting.add(start);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Creates the two-slot gate shared by API reads and native media loads. */
export function createMediaOperationGate(): MediaOperationGate {
  const state: GateState = { active: 0, waiting: new Set() };
  return {
    run: async (signal, operation) => {
      await _acquire(state, signal);
      try {
        signal.throwIfAborted();
        return await operation();
      } finally {
        state.active -= 1;
        state.waiting.values().next().value?.();
      }
    },
  };
}
