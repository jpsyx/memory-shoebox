import type {
  ListRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from "@tanstack/react-query";
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
    nextCursor: string | undefined;
    pageParams: readonly unknown[];
  }>,
): boolean {
  return (
    options.nextCursor !== undefined &&
    options.pageParams.includes(options.nextCursor)
  );
}

/** One independently cached queue tab with its opaque continuation. */
export type RemovalQueueQuery = UseInfiniteQueryResult<
  InfiniteData<ListRemovalRequestsResponse, string | undefined>,
  Error
>;
