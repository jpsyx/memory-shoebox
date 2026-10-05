import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/api/me/me";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
/**
 * Rechecks active authority immediately before a privileged settings
 * operation.
 */
export function requireSettingsAuthority(queryClient: QueryClient): void {
  if (queryClient.getQueryData(meQueryOptions.queryKey)?.me.role !== "admin") {
    throw new ApiRequestError({
      status: 403,
      code: "settings_forbidden",
      message: "Only an admin can manage Shoebox settings.",
    });
  }
}
