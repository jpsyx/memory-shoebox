import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

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
/** Shared write lifecycle checks execution authority and refreshes dependent reads. */
export function useGroupMutation<TData, TVariables>(
  options: Readonly<{
    mutationFn: (variables: TVariables) => Promise<TData>;
    onSaved: () => void;
    onFailed?: (error: Error) => void;
  }>,
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  return useMutation({
    scope: { id: "me" },
    mutationFn: (variables) => {
      requireGroupAuthority(queryClient);
      return options.mutationFn(variables);
    },
    onSuccess: async () => {
      await Promise.all(
        DEPENDENT_KEYS.map((key) => {
          return queryClient.invalidateQueries({ queryKey: [key] });
        }),
      );
      await refreshAuthority();
      options.onSaved();
    },
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
}
