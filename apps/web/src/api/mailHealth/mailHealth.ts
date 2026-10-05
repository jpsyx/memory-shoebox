import { mailHealthResponseSchema } from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/** Real mail diagnosis, available after an active admin session exists. */
export const mailHealthQueryOptions = queryOptions({
  queryKey: ["mail-health"],
  queryFn: () => {
    return apiFetch({ path: "/mail/health", schema: mailHealthResponseSchema });
  },
  staleTime: 0,
  retry: false,
});
