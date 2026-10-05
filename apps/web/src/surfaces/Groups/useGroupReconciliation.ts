import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

import {
  GROUP_CONTINUATION_QUERY_KEY,
  EMPTY_GROUP_RECONCILIATION,
  useGroupReconciliationSnapshot,
  type GroupReconciliationSnapshot,
} from "@/surfaces/Groups/useGroupReconciliationSnapshot";

/**
 * Authority reconciliation is a separate, route-surviving persisted-write
 * lifecycle.
 */
export type GroupReconciliationState = GroupReconciliationSnapshot & {
  onCommitted: () => Promise<void>;
  onRetry: () => void;
};

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
] as const;

async function _refreshGroupDependents(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all(
    DEPENDENT_KEYS.map((key) => {
      return queryClient.invalidateQueries({
        queryKey: [key],
        predicate: (query) => {
          return key !== "groups" || query.queryKey[1] !== "usage";
        },
      });
    }),
  );
}

function _makeSnapshotUpdaterFromQueryClient(
  queryClient: QueryClient,
): (update: Readonly<Partial<GroupReconciliationSnapshot>>) => void {
  return (update) => {
    queryClient.setQueryData<GroupReconciliationSnapshot>(
      GROUP_CONTINUATION_QUERY_KEY,
      (snapshot) => {
        return { ...(snapshot ?? EMPTY_GROUP_RECONCILIATION), ...update };
      },
    );
  };
}

async function _refreshGroupAuthority({
  queryClient,
  refreshAuthority,
  onSaved,
}: Readonly<{
  queryClient: QueryClient;
  refreshAuthority: () => Promise<void>;
  onSaved: () => void;
}>): Promise<void> {
  const updateSnapshot = _makeSnapshotUpdaterFromQueryClient(queryClient);
  if (
    queryClient.getQueryData<GroupReconciliationSnapshot>(
      GROUP_CONTINUATION_QUERY_KEY,
    )?.isRefreshing ??
    false
  ) {
    return;
  }
  updateSnapshot({ isRefreshing: true, error: undefined });
  try {
    await _refreshGroupDependents(queryClient);
    await refreshAuthority();
    queryClient.setQueryData(
      GROUP_CONTINUATION_QUERY_KEY,
      EMPTY_GROUP_RECONCILIATION,
    );
    onSaved();
  } catch (failure) {
    updateSnapshot({
      error:
        failure instanceof Error
          ? failure
          : new Error("Account refresh failed."),
    });
  } finally {
    updateSnapshot({ isRefreshing: false });
  }
}

/**
 * Completed write recovery stays available after its form or dialog unmounts.
 */
export function useGroupReconciliation({
  onSaved,
  completedMessage = "The group changes have been saved.",
}: Readonly<{
  onSaved: () => void;
  completedMessage?: string;
}>): GroupReconciliationState {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const snapshot = useGroupReconciliationSnapshot();
  const updateSnapshot = _makeSnapshotUpdaterFromQueryClient(queryClient);
  const refresh = () => {
    return _refreshGroupAuthority({ queryClient, refreshAuthority, onSaved });
  };
  const onCommitted = async () => {
    updateSnapshot({
      hasCommitted: true,
      message: completedMessage,
    });
    await refresh();
  };
  const onRetry = () => {
    if (snapshot.hasCommitted) {
      void refresh();
    }
  };
  return { ...snapshot, onCommitted, onRetry };
}
