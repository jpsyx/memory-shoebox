import type {
  ListItemRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";

/** Own history and incoming requests are independent responsibilities. */
export type RemovalView = {
  ownNewest: RemovalRequestDto | undefined;
  ownOpen: RemovalRequestDto | undefined;
  incoming: RemovalRequestDto[];
  canAsk: boolean;
};

/** Groups by requester identity, while actions remain capability based. */
export function getRemovalViewFromResponse({
  response,
  viewer,
}: Readonly<{
  response: ListItemRemovalRequestsResponse;
  viewer: Viewer;
}>): RemovalView {
  const requests = response.removalRequests.filter((request, index, rows) => {
    return (
      rows.findIndex((row) => {
        return row.requestId === request.requestId;
      }) === index
    );
  });
  const own = requests
    .filter((request) => {
      return request.requestedBy.memberId === viewer.memberId;
    })
    .toSorted((left, right) => {
      return (
        right.createdAt.localeCompare(left.createdAt) ||
        right.requestId.localeCompare(left.requestId)
      );
    });
  const ownOpen = own.find((request) => {
    return request.state === "open";
  });
  return {
    ownNewest: own[0],
    ownOpen,
    incoming: requests.filter((request) => {
      return request.requestedBy.memberId !== viewer.memberId;
    }),
    canAsk: response.canRequestRemoval && ownOpen === undefined,
  };
}

/** Adds confirmed mutation output without granting stale ask authority. */
export function makeRemovalResponseFromConfirmedRequest({
  response,
  request,
}: Readonly<{
  response: ListItemRemovalRequestsResponse;
  request: RemovalRequestDto;
}>): ListItemRemovalRequestsResponse {
  const current = response.removalRequests.find((row) => {
    return row.requestId === request.requestId;
  });
  const confirmed =
    current !== undefined && current.state !== "open" ? current : request;
  return {
    ...response,
    removalRequests: [
      confirmed,
      ...response.removalRequests.filter((row) => {
        return row.requestId !== request.requestId;
      }),
    ],
  };
}
