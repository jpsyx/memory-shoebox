import {
  cancelNavigationBootstrap,
  isApplyingNavigationBootstrap,
} from "@/api/bootstrap/bootstrap";
import type { QueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "./me";
import {
  getAuthorityFromAccount,
  removePrivateQueries,
} from "./retirePrivateQueries";

const PROTECTED_CLIENTS = new WeakMap<QueryClient, boolean>();

/** Reports account writes that are persisting or reconciling. */
export function hasPendingAccountWrite(queryClient: QueryClient): boolean {
  return (
    queryClient.isMutating({
      predicate: (mutation) => {
        return mutation.options.scope?.id === "me";
      },
    }) > 0
  );
}

/** Keeps read/write ordering owned by the client, including root error recovery. */
export function ensureAccountReadProtection(queryClient: QueryClient): void {
  if (PROTECTED_CLIENTS.has(queryClient)) {
    return;
  }
  PROTECTED_CLIENTS.set(queryClient, true);
  queryClient.getMutationCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.action.type === "pending" &&
      event.mutation.options.scope?.id === "me"
    ) {
      cancelNavigationBootstrap(queryClient);
      void queryClient.cancelQueries({
        queryKey: meQueryOptions.queryKey,
        exact: true,
      });
    }
  });
  _observeAccountPublications(queryClient);
}

function _observeAccountPublications(queryClient: QueryClient): void {
  const initial = queryClient.getQueryData(meQueryOptions.queryKey);
  let previousAuthority =
    initial === undefined ? undefined : getAuthorityFromAccount(initial);
  queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      event.query.queryKey.length !== 1 ||
      event.query.queryKey[0] !== "me"
    ) {
      return;
    }
    const currentAuthority = getAuthorityFromAccount(
      queryClient.getQueryData(meQueryOptions.queryKey),
    );
    const hasAuthorityChanged =
      previousAuthority !== undefined && previousAuthority !== currentAuthority;
    previousAuthority = currentAuthority;
    if (isApplyingNavigationBootstrap(queryClient)) {
      return;
    }
    // Cleared mutations can still publish, so cache membership is not a write fence.
    cancelNavigationBootstrap(queryClient);
    if (hasAuthorityChanged) {
      removePrivateQueries(queryClient);
    }
  });
}
