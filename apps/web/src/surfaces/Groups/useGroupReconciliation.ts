import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import {
  GROUP_CONTINUATION_QUERY_KEY,
  EMPTY_GROUP_RECONCILIATION,
  useGroupReconciliationSnapshot,
  type GroupReconciliationSnapshot,
} from "@/surfaces/Groups/useGroupContinuationGate";

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
      return queryClient.invalidateQueries({
        queryKey: [key],
        predicate: (query) => {
          return key !== "groups" || query.queryKey[1] !== "usage";
        },
      });
    }),
  );
}
function _updateSnapshot(
  queryClient: QueryClient,
  update: Readonly<Partial<GroupReconciliationSnapshot>>,
): void {
  queryClient.setQueryData<GroupReconciliationSnapshot>(
    GROUP_CONTINUATION_QUERY_KEY,
    (snapshot) => {
      return { ...(snapshot ?? EMPTY_GROUP_RECONCILIATION), ...update };
    },
  );
}
function _isRefreshing(queryClient: QueryClient): boolean {
  return (
    queryClient.getQueryData<GroupReconciliationSnapshot>(
      GROUP_CONTINUATION_QUERY_KEY,
    )?.isRefreshing ?? false
  );
}
/** Completed write recovery stays available after its form or dialog unmounts. */
export function useGroupReconciliation(
  onSaved: () => void,
  completedMessage = "The group changes have been saved.",
): GroupReconciliationState {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const snapshot = useGroupReconciliationSnapshot();
  const refresh = async () => {
    if (_isRefreshing(queryClient)) return;
    _updateSnapshot(queryClient, { isRefreshing: true, error: null });
    try {
      await _refreshGroupDependents(queryClient);
      await refreshAuthority();
      queryClient.setQueryData(
        GROUP_CONTINUATION_QUERY_KEY,
        EMPTY_GROUP_RECONCILIATION,
      );
      onSaved();
    } catch (failure) {
      _updateSnapshot(queryClient, {
        error:
          failure instanceof Error
            ? failure
            : new Error("Account refresh failed."),
      });
    } finally {
      _updateSnapshot(queryClient, { isRefreshing: false });
    }
  };
  const onCommitted = async () => {
    _updateSnapshot(queryClient, {
      hasCommitted: true,
      message: completedMessage,
    });
    await refresh();
  };
  const onRetry = () => {
    if (snapshot.hasCommitted) void refresh();
  };
  return { ...snapshot, onCommitted, onRetry };
}
/** Authority reconciliation is a separate, route-surviving persisted-write lifecycle. */
export type GroupReconciliationState = GroupReconciliationSnapshot & {
  onCommitted: () => Promise<void>;
  onRetry: () => void;
};
