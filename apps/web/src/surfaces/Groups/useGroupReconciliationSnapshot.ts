import { useQuery } from "@tanstack/react-query";

/**
 * The completed status and its actual refresh failure survive navigation
 * together.
 */
export type GroupReconciliationSnapshot = {
  hasCommitted: boolean;
  isRefreshing: boolean;
  error: Error | undefined;
  message: string;
};

/**
 * Route-surviving completed-write recovery, separate from server group reads.
 */
export const GROUP_CONTINUATION_QUERY_KEY = ["group-continuation"] as const;

/** No unresolved persisted write requires continuation recovery initially. */
export const EMPTY_GROUP_RECONCILIATION: GroupReconciliationSnapshot = {
  hasCommitted: false,
  isRefreshing: false,
  error: undefined,
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
