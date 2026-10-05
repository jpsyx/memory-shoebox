import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  useGroupReconciliation,
  type GroupReconciliationState,
} from "@/surfaces/Groups/useGroupReconciliation";
import { GROUP_CONTINUATION_QUERY_KEY } from "@/surfaces/Groups/useGroupContinuationGate";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

/** Shared write lifecycle checks execution authority and refreshes dependent reads. */
export function useGroupMutation<TData, TVariables>(
  options: Readonly<{
    mutationFn: (variables: TVariables) => Promise<TData>;
    onSaved: () => void;
    onFailed?: (error: Error) => void;
  }>,
): GroupMutationResult<TData, TVariables> {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const reconciliation = useGroupReconciliation(options.onSaved);
  const mutation = useMutation<TData, Error, TVariables>({
    scope: { id: "me" },
    mutationFn: (variables) => {
      requireGroupAuthority(queryClient);
      if (queryClient.getQueryData(GROUP_CONTINUATION_QUERY_KEY) === true) {
        throw new Error("Refresh your account before another group change.");
      }
      return options.mutationFn(variables);
    },
    onSuccess: reconciliation.onCommitted,
    onError: async (error) => {
      options.onFailed?.(error);
      if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        await refreshAuthority().catch(() => {});
      }
    },
  });
  return { ...mutation, reconciliation };
}

/** A write result keeps authority recovery separate from mutation failure. */
export type GroupMutationResult<TData, TVariables> = UseMutationResult<
  TData,
  Error,
  TVariables
> & { reconciliation: GroupReconciliationState };
