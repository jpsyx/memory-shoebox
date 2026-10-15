import {
  bootstrapResponseSchema,
  type BootstrapResponse,
} from "@memory-shoebox/shared";
import {
  CancelledError,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { discardBootstrapRedirect } from "./bootstrapRedirect";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/** Actual navigation always reads current authority, with no implicit retries. */
export const bootstrapQueryOptions = queryOptions({
  queryKey: ["bootstrap"],
  queryFn: ({ signal }) => {
    return apiFetch({
      path: "/bootstrap",
      schema: bootstrapResponseSchema,
      init: { signal },
    });
  },
  staleTime: 0,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

const APPLYING_BOOTSTRAP = new WeakSet<QueryClient>();
const BOOTSTRAP_GENERATIONS = new WeakMap<QueryClient, number>();

/** Identifies the write boundary a navigation read must still belong to. */
export function getBootstrapGenerationFromClient(client: QueryClient): number {
  return BOOTSTRAP_GENERATIONS.get(client) ?? 0;
}

/** Retires pending and already-settled navigation reads before account writes. */
export function cancelNavigationBootstrap(client: QueryClient): void {
  discardBootstrapRedirect(client);
  BOOTSTRAP_GENERATIONS.set(
    client,
    getBootstrapGenerationFromClient(client) + 1,
  );
  void client.cancelQueries({ queryKey: bootstrapQueryOptions.queryKey });
}

/** Identifies synchronous navigation seeding to avoid recursive invalidation. */
export function isApplyingNavigationBootstrap(client: QueryClient): boolean {
  return APPLYING_BOOTSTRAP.has(client);
}

/** Publishes one response while existing observers reconcile its dependents. */
export function applyNavigationBootstrap(
  options: Readonly<{
    queryClient: QueryClient;
    bootstrap: BootstrapResponse;
    generation: number;
    apply: (bootstrap: BootstrapResponse) => void;
  }>,
): void {
  if (
    options.generation !== getBootstrapGenerationFromClient(options.queryClient)
  ) {
    throw new CancelledError();
  }
  APPLYING_BOOTSTRAP.add(options.queryClient);
  try {
    options.apply(options.bootstrap);
  } finally {
    APPLYING_BOOTSTRAP.delete(options.queryClient);
  }
}
