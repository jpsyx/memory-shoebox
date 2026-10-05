import { itemQueryOptions } from "@/api/items/items";
import { makeItemRemovalRequestsQueryOptionsFromIdentity } from "@/api/removalsHelpers/removalsQueryHelpers";
import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
/** Captured create identity survives route and member changes. */
export type RemovalAskOperation = {
  memberId: string;
  itemId: string;
  reason: string;
  token: object;
};

/**
 * Reconciles only own open requests, safe under the server's unique open
 * constraint.
 */
export async function getOwnOpenRequestFromAsk({
  queryClient,
  operation,
}: Readonly<{
  queryClient: QueryClient;
  operation: RemovalAskOperation;
}>): Promise<RemovalRequestDto | undefined> {
  const history = await queryClient.fetchQuery({
    ...makeItemRemovalRequestsQueryOptionsFromIdentity(operation),
    staleTime: 0,
    retry: false,
  });
  return history.removalRequests.find((request) => {
    return (
      request.requestedBy.memberId === operation.memberId &&
      request.state === "open"
    );
  });
}

/**
 * Refreshes the authority that permits asking again without counting an open.
 */
export async function refreshRemovalAskReads({
  queryClient,
  operation,
}: Readonly<{
  queryClient: QueryClient;
  operation: RemovalAskOperation;
}>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey:
        makeItemRemovalRequestsQueryOptionsFromIdentity(operation).queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: ["removal-requests", "queue", operation.memberId],
    }),
    queryClient.invalidateQueries({
      queryKey: itemQueryOptions(operation.itemId).queryKey,
      exact: true,
      refetchType: "none",
    }),
  ]);
  markPileStale(queryClient);
}
