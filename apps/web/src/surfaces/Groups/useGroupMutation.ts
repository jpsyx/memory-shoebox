import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  useGroupReconciliation,
  type GroupReconciliationState,
} from "@/surfaces/Groups/useGroupReconciliation";
import {
  GROUP_CONTINUATION_QUERY_KEY,
  type GroupReconciliationSnapshot,
} from "@/surfaces/Groups/useGroupReconciliationSnapshot";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { requireGroupAuthority } from "@/surfaces/Groups/requireGroupAuthority";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

/** A write result keeps authority recovery separate from mutation failure. */
export type GroupMutationResult<TData, TVariables> = UseMutationResult<
  TData,
  Error,
  TVariables
> & { reconciliation: GroupReconciliationState };
type GroupMutationOptions<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSaved: () => void;
  completedMessage: string;
  onFailed?: (error: Error) => void;
};

/**
 * Shared write lifecycle checks execution authority and refreshes dependent
 * reads.
 */
export function useGroupMutation<TData, TVariables>(
  options: Readonly<GroupMutationOptions<TData, TVariables>>,
): GroupMutationResult<TData, TVariables> {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const reconciliation = useGroupReconciliation({
    onSaved: options.onSaved,
    completedMessage: options.completedMessage,
  });
  const mutation = useMutation<TData, Error, TVariables>({
    scope: { id: "me" },
    mutationFn: (variables) => {
      requireGroupAuthority(queryClient);
      if (
        queryClient.getQueryData<GroupReconciliationSnapshot>(
          GROUP_CONTINUATION_QUERY_KEY,
        )?.hasCommitted
      ) {
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
