import { apiFetch } from "@/api/clientHelpers/clientHelpers";
import { deleteItem, itemQueryOptions } from "@/api/items/items";
import {
  declineRemovalRequest,
  withdrawRemovalRequest,
} from "@/api/removalsHelpers/removalsHelpers";
import { makeItemRemovalRequestsQueryOptionsFromIdentity } from "@/api/removalsHelpers/removalsQueryHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import {
  type ListRemovalRequestsResponse,
  listRemovalRequestsResponseSchema,
  type RemovalRequestDto,
} from "@memory-shoebox/shared";
import { type QueryClient } from "@tanstack/react-query";
type QueueReadOptions = {
  queryClient: QueryClient;
  operation: RemovalOperation;
  state: "open" | "settled";
  cursors: string[];
};

/** Immutable identity and arguments of one submitted answer. */
export type RemovalOperation = {
  action: "delete" | "decline" | "withdraw";
  request: RemovalRequestDto;
  viewer: Viewer;
  declineReason?: string;
};

/** Dispatches exactly one write using captured arguments. */
export function submitRemovalOperation(
  operation: Readonly<RemovalOperation>,
): Promise<RemovalRequestDto | void> {
  if (operation.action === "delete" && operation.request.itemId !== null) {
    return deleteItem(operation.request.itemId);
  }
  return operation.action === "decline"
    ? declineRemovalRequest({
        requestId: operation.request.requestId,
        body: { declineReason: operation.declineReason ?? "" },
      })
    : withdrawRemovalRequest(operation.request.requestId);
}

/**
 * Both queue tabs and matching history change together; item GET stays quiet.
 */
export async function refreshRemovalReads(
  options: Readonly<{ queryClient: QueryClient; operation: RemovalOperation }>,
): Promise<void> {
  const { queryClient, operation } = options;
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: ["removal-requests", "queue", operation.viewer.memberId],
    }),
    operation.request.itemId !== null
      ? queryClient.invalidateQueries({
          queryKey: makeItemRemovalRequestsQueryOptionsFromIdentity({
            memberId: operation.viewer.memberId,
            itemId: operation.request.itemId,
          }).queryKey,
        })
      : undefined,
  ].filter((invalidation) => {
    return invalidation !== undefined;
  });
  if (operation.request.itemId !== null) {
    const itemId = operation.request.itemId;
    void queryClient.invalidateQueries({
      queryKey: itemQueryOptions(itemId).queryKey,
      exact: true,
      refetchType: "none",
    });
  }
  markPileStale(queryClient);
  await Promise.all(invalidations);
}

/** Re-reads request history, never the counted item detail GET. */
export async function getAuthoritativeRequestFromOperation(
  options: Readonly<{ queryClient: QueryClient; operation: RemovalOperation }>,
): Promise<RemovalRequestDto | undefined> {
  const { queryClient, operation } = options;
  const hasQueueScope =
    operation.viewer.role === "admin" ||
    (operation.viewer.role === "uploader" &&
      operation.request.uploadedBy.memberId === operation.viewer.memberId);
  if (!hasQueueScope) {
    if (operation.request.itemId === null) {
      throw new Error("Request history unavailable");
    }
    const history = await queryClient.fetchQuery({
      ...makeItemRemovalRequestsQueryOptionsFromIdentity({
        memberId: operation.viewer.memberId,
        itemId: operation.request.itemId,
      }),
      staleTime: 0,
    });
    return history.removalRequests.find((request) => {
      return request.requestId === operation.request.requestId;
    });
  }
  const requests = await Promise.all(
    (["open", "settled"] as const).map((state) => {
      return _readQueueRequest({ ...options, state, cursors: [] });
    }),
  );
  return requests[1] ?? requests[0];
}

async function _getQueuePageFromReadOptions(
  options: Readonly<
    Omit<QueueReadOptions, "cursors"> & { cursors: readonly string[] }
  >,
): Promise<ListRemovalRequestsResponse> {
  const { queryClient, operation, state, cursors } = options;
  const searchParams = new URLSearchParams({ state });
  const cursor = cursors.at(-1);
  if (cursor !== undefined) {
    searchParams.set("cursor", cursor);
  }
  const page = await queryClient.fetchQuery({
    queryKey: [
      "removal-requests",
      "authority",
      operation.viewer.memberId,
      operation.request.requestId,
      state,
      cursor ?? "",
    ],
    queryFn: () => {
      return apiFetch({
        path: `/removal-requests?${searchParams}`,
        schema: listRemovalRequestsResponseSchema,
      });
    },
    staleTime: 0,
    retry: false,
  });
  return page;
}
async function _readQueueRequest(
  options: Readonly<
    Omit<QueueReadOptions, "cursors"> & { cursors: readonly string[] }
  >,
): Promise<RemovalRequestDto | undefined> {
  const { operation, cursors } = options;
  const page = await _getQueuePageFromReadOptions(options);
  const request = page.removalRequests.find((row) => {
    return row.requestId === operation.request.requestId;
  });
  if (request !== undefined || page.nextCursor === null) {
    return request;
  }
  if (cursors.includes(page.nextCursor)) {
    throw new Error("Queue cursor repeated");
  }
  return _readQueueRequest({
    ...options,
    cursors: [...cursors, page.nextCursor],
  });
}
