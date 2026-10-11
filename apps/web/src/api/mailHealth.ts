import type { MailHealthResponse } from "@memory-shoebox/shared";
import type {
  QueryClient,
  UnusedSkipTokenOptions,
} from "@tanstack/react-query";
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
}) satisfies UnusedSkipTokenOptions<
  MailHealthResponse,
  Error,
  MailHealthResponse,
  string[]
>;

/** Forces an explicit diagnosis while sharing the ordinary query's UI state. */
export async function recheckMailHealth(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.cancelQueries({
    queryKey: mailHealthQueryOptions.queryKey,
  });
  await queryClient.fetchQuery({
    ...mailHealthQueryOptions,
    queryFn: () => {
      return apiFetch({
        path: "/mail/health?refresh=true",
        schema: mailHealthResponseSchema,
      });
    },
  });
}
