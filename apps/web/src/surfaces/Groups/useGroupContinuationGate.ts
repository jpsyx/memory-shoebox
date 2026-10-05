import { useGroupReconciliationSnapshot } from "./useGroupReconciliationSnapshot";

/**
 * Other group controls stay disabled until the completed write reconciles
 * authority.
 */
export function useGroupContinuationGate(): boolean {
  return useGroupReconciliationSnapshot().hasCommitted;
}
