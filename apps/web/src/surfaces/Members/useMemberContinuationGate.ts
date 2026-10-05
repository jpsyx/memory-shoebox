import { useQuery } from "@tanstack/react-query";

/** Committed member writes retain recovery until account authority is refreshed. */
export const MEMBER_CONTINUATION_QUERY_KEY = ["member-continuation"] as const;
/** A read failure cannot turn an acknowledged write back into an editable draft. */
export type MemberReconciliation = {
  hasCommitted: boolean;
  isRefreshing: boolean;
  error: Error | null;
};
/** Initial state has no outstanding committed member change. */
export const EMPTY_MEMBER_RECONCILIATION: MemberReconciliation = {
  hasCommitted: false,
  isRefreshing: false,
  error: null,
};
/** Recovery survives route unmounts and query cache expiration. */
export function useMemberContinuationGate(): MemberReconciliation {
  return useQuery({
    queryKey: MEMBER_CONTINUATION_QUERY_KEY,
    queryFn: () => {
      return EMPTY_MEMBER_RECONCILIATION;
    },
    initialData: EMPTY_MEMBER_RECONCILIATION,
    enabled: false,
    gcTime: Infinity,
  }).data;
}
