import type { MeResponse } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Retires private reads and continuations while retaining the current
 * public/account baseline.
 */
export function removePrivateQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => {
      const key = JSON.stringify(query.queryKey);
      return !['["me"]', '["public-settings"]', '["setup","status"]'].includes(
        key,
      );
    },
  });
}

/** Identifies the member and role that own private client state. */
export function getAuthorityFromAccount(
  account: Readonly<MeResponse> | undefined,
): string {
  return JSON.stringify([account?.me.member.memberId, account?.me.role]);
}
