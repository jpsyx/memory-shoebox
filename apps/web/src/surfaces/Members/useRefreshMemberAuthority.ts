import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { meQueryOptions } from "@/api/me/me";

/**
 * Refreshes the account read before re-running the root and signed-in guards.
 */
export function useRefreshMemberAuthority(): () => Promise<void> {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    await queryClient.fetchQuery({
      ...meQueryOptions,
      staleTime: 0,
      retry: false,
    });
    await router.invalidate();
  }, [queryClient, router]);
}
