import type { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions } from "@/api/me/me";
/** Refuses privileged execution when cached active authority has changed. */
export function requireGroupAuthority(queryClient: QueryClient): void {
  if (queryClient.getQueryData(meQueryOptions.queryKey)?.me.role !== "admin") {
    throw new ApiRequestError({
      status: 403,
      code: "groups_forbidden",
      message: "Only an admin can manage groups.",
    });
  }
}
