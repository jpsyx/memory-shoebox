import { getPrefetchCostsFromCandidate } from "../mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";
import type { SchedulerState } from "./createMediaPrefetchScheduler.types";

/** Totals the bytes held by active loads, the retained decode and its handoff. */
export function getMediaReservationsFromSchedulerState(
  state: Readonly<SchedulerState>,
): {
  encodedBytes: number;
  decodedBytes: number;
} {
  const candidates = [
    ...[...state.active.values()].map((operation) => {
      return operation.candidate;
    }),
    state.retained?.candidate,
    state.handoff?.candidate,
  ].filter((candidate) => {
    return candidate !== undefined;
  });
  return candidates.reduce(
    (total, candidate) => {
      const cost = getPrefetchCostsFromCandidate(candidate);
      return {
        encodedBytes: total.encodedBytes + cost.encodedBytes,
        decodedBytes: total.decodedBytes + cost.decodedBytes,
      };
    },
    { encodedBytes: 0, decodedBytes: 0 },
  );
}
