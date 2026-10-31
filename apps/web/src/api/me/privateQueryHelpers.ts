import type { MeResponse } from "@memory-shoebox/shared";
import type { Query, QueryClient } from "@tanstack/react-query";

const PRIVATE_RETIREMENTS = new WeakMap<QueryClient, Set<() => void>>();

/** Observes explicit private-cache retirement even when its cache is empty. */
export function subscribePrivateRetirement(
  client: QueryClient,
  listener: () => void,
): () => void {
  const listeners = PRIVATE_RETIREMENTS.get(client) ?? new Set<() => void>();
  PRIVATE_RETIREMENTS.set(client, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const PRIVATE_GENERATIONS = new WeakMap<QueryClient, number>();

/**
 * Retires private reads and continuations while retaining the current
 * public/account baseline.
 */
export function removePrivateQueries(queryClient: QueryClient): void {
  PRIVATE_GENERATIONS.set(
    queryClient,
    (PRIVATE_GENERATIONS.get(queryClient) ?? 0) + 1,
  );
  PRIVATE_RETIREMENTS.get(queryClient)?.forEach((listener) => {
    return listener();
  });
  queryClient.removeQueries({
    predicate: (query) => {
      const key = JSON.stringify(query.queryKey);
      return !['["me"]', '["public-settings"]', '["setup","status"]'].includes(
        key,
      );
    },
  });
}

/** Identifies the account, role and actual session owning private state. */
export function getAuthorityFromAccount(
  account: Readonly<MeResponse> | undefined,
): string {
  return JSON.stringify([
    account?.me.member.memberId,
    account?.me.role,
    account?.sessionId,
  ]);
}

/** Identifies one account query and its private continuation lifetime. */
export type PrivateAuthority = {
  authority: string;
  query: Query | undefined;
  generation: number;
};

/** Captures the current account query and its private lifetime. */
export function capturePrivateAuthority(client: QueryClient): PrivateAuthority {
  return {
    authority: getAuthorityFromAccount(client.getQueryData<MeResponse>(["me"])),
    query: client.getQueryCache().find({ queryKey: ["me"], exact: true }),
    generation: PRIVATE_GENERATIONS.get(client) ?? 0,
  };
}

/** Tests whether a private continuation still owns a live account. */
export function isPrivateAuthorityCurrent(
  client: QueryClient,
  ticket: Readonly<ReturnType<typeof capturePrivateAuthority>>,
): boolean {
  const account = client.getQueryData<MeResponse | null>(["me"]);
  return (
    !!account &&
    ticket.query ===
      client.getQueryCache().find({ queryKey: ["me"], exact: true }) &&
    ticket.generation === (PRIVATE_GENERATIONS.get(client) ?? 0) &&
    ticket.authority === getAuthorityFromAccount(account)
  );
}

/** Merges only the fields owned by one independent account mutation. */
export function reconcileAccountFields(
  client: QueryClient,
  response: Readonly<MeResponse>,
  field: "avatar" | "name" | "notify",
  ticket: Readonly<ReturnType<typeof capturePrivateAuthority>>,
): void {
  if (!isPrivateAuthorityCurrent(client, ticket)) {
    return;
  }
  client.setQueryData<MeResponse>(["me"], (current) => {
    if (!current) {
      return current;
    }
    const changes =
      field === "name"
        ? {
            storedDisplayName: response.me.storedDisplayName,
            profileComplete: response.me.profileComplete,
            suggestedDisplayName: response.me.suggestedDisplayName,
            member: {
              ...current.me.member,
              displayName: response.me.member.displayName,
            },
          }
        : field === "avatar"
          ? {
              member: {
                ...current.me.member,
                avatar: response.me.member.avatar,
              },
            }
          : { notify: response.me.notify };
    return { ...current, me: { ...current.me, ...changes } };
  });
}
