import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { meQueryOptions } from "@/api/me/me";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** Refreshes the account read before re-running the root and signed-in guards. */
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

/** A privileged read refusal reconciles stale authority, retaining real faults. */
export function useMemberReadAuthority(error: Error | null): void {
  const refreshAuthority = useRefreshMemberAuthority();
  useEffect(() => {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      // A failed account recheck leaves the existing directory Retry available.
      void refreshAuthority().catch(() => {});
    }
  }, [error, refreshAuthority]);
}
