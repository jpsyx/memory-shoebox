import { QueryClient } from "@tanstack/react-query";

/**
 * The app-wide TanStack Query client.
 *
 * Retries are limited to one attempt: Memory Shoebox talks to its own server on the
 * same origin, so a failure is usually a real error worth surfacing rather
 * than a transient network blip worth hiding.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
