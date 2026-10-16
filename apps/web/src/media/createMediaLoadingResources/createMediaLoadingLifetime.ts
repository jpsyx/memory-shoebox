import {
  createMediaOperationGate,
  type MediaOperationGate,
} from "../createMediaOperationGate/createMediaOperationGate";

/** Shared settlement only; no member metadata crosses this lifetime. */
export type MediaLoadingLifetime = MediaOperationGate & {
  /** Delays the next member's speculation until old owned work settles. */
  retire: (work: ReadonlyArray<Promise<unknown>>) => void;
};
/** Owns the app-wide operation cap across member/provider replacement. */
export function createMediaLoadingLifetime(): MediaLoadingLifetime {
  const gate = createMediaOperationGate();
  let retiredWork = Promise.resolve();
  return {
    run: ({ signal, operation }) => {
      const priorMember = retiredWork;
      return gate.run({
        signal: signal,
        operation: async () => {
          await priorMember;
          signal.throwIfAborted();
          return operation();
        },
      });
    },
    retire: (work) => {
      retiredWork = Promise.allSettled([retiredWork, ...work]).then(() => {});
    },
  };
}
