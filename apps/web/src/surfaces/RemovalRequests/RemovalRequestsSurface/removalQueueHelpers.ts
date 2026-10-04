import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from "@tanstack/react-query";
import type {
  ListRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";

/** Request identity, rather than pages, determines which cards appear once. */
export function getRequestsFromQueuePages(
  pages: readonly ListRemovalRequestsResponse[],
): RemovalRequestDto[] {
  return [
    ...new Map(
      pages
        .flatMap((page) => {
          return page.removalRequests;
        })
        .map((request) => {
          return [request.requestId, request];
        }),
    ).values(),
  ];
}

/** A cursor already consumed cannot advance an opaque queue. */
export function hasRepeatedQueueCursor(
  options: Readonly<{
    nextCursor: string | null;
    pageParams: readonly unknown[];
  }>,
): boolean {
  return (
    options.nextCursor !== null &&
    options.pageParams.includes(options.nextCursor)
  );
}

/** One independently cached queue tab with its opaque continuation. */
export type RemovalQueueQuery = UseInfiniteQueryResult<
  InfiniteData<ListRemovalRequestsResponse, string | null>,
  Error
>;
