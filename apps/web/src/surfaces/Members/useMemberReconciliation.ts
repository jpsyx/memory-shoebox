import { useQueryClient } from "@tanstack/react-query";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import {
  EMPTY_MEMBER_RECONCILIATION,
  MEMBER_CONTINUATION_QUERY_KEY,
  type MemberReconciliation,
} from "@/surfaces/Members/useMemberContinuationGate";

const DEPENDENT_KEYS = [
  "members",
  "groups",
  "timeline",
  "items",
  "bursts",
  "people",
  "presence",
  "activity",
  "observations",
  "removal-requests",
  "milestones",
  "me",
];
/** Retry only reads after a committed write, retaining the gate on failure. */
export function useMemberReconciliation(): () => Promise<void> {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  return async () => {
    const snapshot = queryClient.getQueryData<MemberReconciliation>(
      MEMBER_CONTINUATION_QUERY_KEY,
    );
    if (snapshot?.isRefreshing) {
      return;
    }
    queryClient.setQueryData(MEMBER_CONTINUATION_QUERY_KEY, {
      hasCommitted: true,
      isRefreshing: true,
      error: null,
    });
    try {
      await Promise.all(
        DEPENDENT_KEYS.map((key) => {
          return queryClient.invalidateQueries({ queryKey: [key] });
        }),
      );
      await refreshAuthority();
      queryClient.setQueryData(
        MEMBER_CONTINUATION_QUERY_KEY,
        EMPTY_MEMBER_RECONCILIATION,
      );
    } catch (failure) {
      queryClient.setQueryData(MEMBER_CONTINUATION_QUERY_KEY, {
        hasCommitted: true,
        isRefreshing: false,
        error:
          failure instanceof Error
            ? failure
            : new Error("Account refresh failed."),
      });
    }
  };
}
