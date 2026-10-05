import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { meQueryOptions } from "@/api/me/me";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { useRefreshMemberAuthority } from "./useRefreshMemberAuthority";

/**
 * A privileged read refusal reconciles stale authority, retaining real faults.
 */
export function useMemberReadAuthority(error: Error | undefined): void {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  useEffect(
    function refreshRefusedMemberAuthority() {
      if (
        queryClient.getQueryData(meQueryOptions.queryKey) !== null &&
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        // A failed account recheck keeps the directory Retry available.
        void refreshAuthority().catch(() => {});
      }
    },
    [error, refreshAuthority, queryClient],
  );
}
