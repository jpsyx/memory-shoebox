import { releaseStatusResponseSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/** Release metadata is read independently so outages cannot block settings. */
export const releaseStatusQueryOptions = queryOptions({
  queryKey: ["release-status"],
  queryFn: () => {
    return apiFetch({
      path: "/settings/version",
      schema: releaseStatusResponseSchema,
    });
  },
  staleTime: 5 * 60 * 1000,
  refetchInterval: 60 * 60 * 1000,
  retry: false,
});
