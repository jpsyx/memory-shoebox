import { completeSetup, setupProgressQueryOptions } from "@/api/setup/setup";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

/** Completes optional invitations and opens the Shoebox home. */
export function useCompleteInvitations(): UseMutationResult<
  void,
  Error,
  void,
  unknown
> {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: completeSetup,
    onSuccess: async () => {
      client.setQueryData(setupProgressQueryOptions.queryKey, {
        needsInvitations: false,
      });
      await client.invalidateQueries({
        queryKey: setupProgressQueryOptions.queryKey,
      });
      await navigate({ to: "/", replace: true });
    },
  });
}
