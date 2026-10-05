import { useQuery } from "@tanstack/react-query";

/** Route-surviving completed-write recovery, separate from server group reads. */
export const GROUP_CONTINUATION_QUERY_KEY = ["group-continuation"] as const;
/** The completed status and its actual refresh failure survive navigation together. */
export type GroupReconciliationSnapshot = {
  hasCommitted: boolean;
  isRefreshing: boolean;
  error: Error | null;
  message: string;
};
/** No unresolved persisted write requires continuation recovery initially. */
export const EMPTY_GROUP_RECONCILIATION: GroupReconciliationSnapshot = {
  hasCommitted: false,
  isRefreshing: false,
  error: null,
  message: "",
};
/** Every recovery owner observes the same route-surviving snapshot. */
export function useGroupReconciliationSnapshot(): GroupReconciliationSnapshot {
  const snapshot = useQuery({
    queryKey: GROUP_CONTINUATION_QUERY_KEY,
    queryFn: () => {
      return EMPTY_GROUP_RECONCILIATION;
    },
    initialData: EMPTY_GROUP_RECONCILIATION,
    enabled: false,
    gcTime: Infinity,
  });
  return snapshot.data;
}
/** Other group controls stay disabled until the completed write reconciles authority. */
export function useGroupContinuationGate(): boolean {
  return useGroupReconciliationSnapshot().hasCommitted;
}
