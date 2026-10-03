import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/**
 * A refusal is an answer. Only a server fault or a dropped call is retried.
 *
 * Takes `failureCount` and `error` positionally, not as an options object:
 * TanStack Query's `retry` option is typed as
 * `(failureCount: number, error: TError) => boolean`, so this function is
 * called by the library with those two positional arguments.
 */
function _isWorthRetrying(failureCount: number, error: Error): boolean {
  return error instanceof ApiRequestError && error.status < 500
    ? false
    : failureCount < 1;
}

/**
 * The app-wide TanStack Query client.
 *
 * Retries are limited to one attempt: Memory Shoebox talks to its own server
 * on the same origin, so a failure is usually a real error worth surfacing
 * rather than a transient network blip worth hiding. A 4xx is not retried at
 * all, because a 404, a 403 and a 429 are all answers, and asking again
 * doubles the latency of every genuine refusal.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: _isWorthRetrying,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
