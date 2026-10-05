import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import { GROUP_CONTINUATION_QUERY_KEY } from "@/surfaces/Groups/useGroupContinuationGate";

const DEPENDENT_KEYS = [
  "groups",
  "members",
  "timeline",
  "items",
  "bursts",
  "presence",
  "activity",
  "observations",
  "me",
];
async function _refreshGroupDependents(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all(
    DEPENDENT_KEYS.map((key) => {
      return queryClient.invalidateQueries({ queryKey: [key] });
    }),
  );
}
/** Persisted success survives a failed authority refresh without repeating the write. */
export function useGroupReconciliation(
  onSaved: () => void,
): GroupReconciliationState {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const [hasCommitted, setHasCommitted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await _refreshGroupDependents(queryClient);
      await refreshAuthority();
      queryClient.setQueryData(GROUP_CONTINUATION_QUERY_KEY, false);
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure
          : new Error("Account refresh failed."),
      );
    } finally {
      setIsRefreshing(false);
    }
  };
  const onCommitted = async () => {
    setHasCommitted(true);
    queryClient.setQueryData(GROUP_CONTINUATION_QUERY_KEY, true);
    await refresh();
  };
  const onRetry = () => {
    if (!isRefreshing && hasCommitted) void refresh();
  };
  return { hasCommitted, isRefreshing, error, onCommitted, onRetry };
}
/** Authority reconciliation is a separate lifecycle from the persisted mutation. */
export type GroupReconciliationState = {
  hasCommitted: boolean;
  isRefreshing: boolean;
  error: Error | null;
  onCommitted: () => Promise<void>;
  onRetry: () => void;
};
