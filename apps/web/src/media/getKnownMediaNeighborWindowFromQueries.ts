import {
  timelineSelectionSchema,
  type MediaNeighborsRequest,
  type MediaNeighborsResponse,
  type MediaPreview,
} from "@memory-shoebox/shared";
import type { InfiniteData, QueryClient, Query } from "@tanstack/react-query";
import { makeQueryFromSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import type { TimelineQueryPage } from "@/api/timelineHelpers/timelineHelpers";
type SequenceNeighborsOptions = {
  sequence: Sequence;
  index: number;
  before: number;
  after: number;
  direction: MediaNeighborsRequest["direction"];
};

/** Proven identity; media can be renewed without reconstructing ordering. */
export type KnownMediaNeighbor = {
  itemId: string;
  preview?: MediaPreview;
  isBurst?: boolean;
};
/** Exact directional IDs from a retained, authorized neighborhood. */
export type KnownMediaNeighborWindow = {
  metadataUpdatedAt: number;
  ahead: KnownMediaNeighbor[];
  behind: KnownMediaNeighbor[];
};
type SequenceNode = KnownMediaNeighbor & { pageIndex: number };
type Sequence = {
  nodes: Array<SequenceNode | undefined>;
  metadataUpdatedAt: Array<number | undefined>;
  hasStart: boolean;
  hasEnd: boolean;
};

function _getMetadataUpdatedAtFromRange({
  sequence,
  start,
  end,
}: {
  sequence: Sequence;
  start: number;
  end: number;
}): number | undefined {
  const firstPage = start < 0 ? 0 : sequence.nodes[start]!.pageIndex;
  const lastPage =
    end > sequence.nodes.length
      ? sequence.metadataUpdatedAt.length - 1
      : sequence.nodes[end - 1]!.pageIndex;
  const metadataUpdatedAt = Math.min(
    ...sequence.metadataUpdatedAt
      .slice(firstPage, lastPage + 1)
      .map((timestamp) => {
        return timestamp ?? Number.NaN;
      }),
  );
  return Number.isFinite(metadataUpdatedAt) &&
    metadataUpdatedAt > Date.now() - 30_000
    ? metadataUpdatedAt
    : undefined;
}

function _getCanonicalQuery(query: string): string {
  return new URLSearchParams(
    [...new URLSearchParams(query)]
      .filter(([key, value], index, entries) => {
        return (
          entries.findIndex(([otherKey, otherValue]) => {
            return key === otherKey && value === otherValue;
          }) === index
        );
      })
      .toSorted(([leftKey, leftValue], [rightKey, rightValue]) => {
        return (
          leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
        );
      }),
  ).toString();
}
function _getWindowFromSequence({
  sequence,
  request,
}: {
  sequence: Sequence;
  request: MediaNeighborsRequest;
}): KnownMediaNeighborWindow | undefined {
  const index = sequence.nodes.findIndex((node) => {
    return node?.itemId === request.itemId;
  });
  if (index < 0) {
    return undefined;
  }
  const before = request.direction === "next" ? 1 : 2;
  const after = request.direction === "next" ? 2 : 1;
  if (
    (index < before && !sequence.hasStart) ||
    (index + after >= sequence.nodes.length && !sequence.hasEnd)
  ) {
    return undefined;
  }
  const neighbors = _getNeighborsFromSequence({
    sequence,
    index,
    before,
    after,
    direction: request.direction,
  });
  if (neighbors === undefined) {
    return undefined;
  }
  const metadataUpdatedAt = _getMetadataUpdatedAtFromRange({
    sequence,
    start: index - before,
    end: index + after + 1,
  });
  return metadataUpdatedAt === undefined
    ? undefined
    : {
        ...neighbors,
        metadataUpdatedAt,
      };
}

function _getNeighborsFromSequence({
  sequence,
  index,
  before,
  after,
  direction,
}: SequenceNeighborsOptions):
  | Pick<KnownMediaNeighborWindow, "ahead" | "behind">
  | undefined {
  const selected = sequence.nodes.slice(
    Math.max(0, index - before),
    index + after + 1,
  );
  if (
    selected.some((node) => {
      return node === undefined || node.isBurst;
    })
  ) {
    return undefined;
  }
  const previous = sequence.nodes
    .slice(Math.max(0, index - before), index)
    .reverse() as KnownMediaNeighbor[];
  const following = sequence.nodes.slice(
    index + 1,
    index + after + 1,
  ) as KnownMediaNeighbor[];
  return direction === "next"
    ? { ahead: following, behind: previous }
    : { ahead: previous, behind: following };
}
function _getTimelineSequence(
  data: InfiniteData<TimelineQueryPage, string | undefined>,
): Sequence | undefined {
  if (data.pages.length === 0 || data.pages.length !== data.pageParams.length) {
    return undefined;
  }
  const nodes = data.pages.flatMap((page, index) => {
    const gap =
      index > 0 &&
      !(
        typeof data.pages[index - 1]?.nextCursor === "string" &&
        data.pages[index - 1]?.nextCursor === data.pageParams[index]
      ) &&
      !(
        typeof page.previousCursor === "string" &&
        page.previousCursor === data.pageParams[index - 1]
      );
    return [
      ...(gap ? [undefined] : []),
      ...page.days.flatMap((day) => {
        return day.items.map((item) => {
          return {
            pageIndex: index,
            itemId: item.itemId,
            isBurst: item.burst !== null,
            preview: {
              itemId: item.itemId,
              kind: item.kind,
              width: item.media.width,
              height: item.media.height,
              media: item.media,
            },
          };
        });
      }),
    ];
  });
  return {
    nodes,
    metadataUpdatedAt: data.pages.map((page) => {
      return page.metadataUpdatedAt;
    }),
    hasStart: data.pages[0]?.previousCursor === null,
    hasEnd: data.pages.at(-1)?.nextCursor === null,
  };
}
function _getNeighborhoodSequence({
  query,
  canonical,
}: {
  query: Query;
  canonical: string;
}): Sequence | undefined {
  const selection = timelineSelectionSchema.safeParse(query.queryKey.at(-2));
  const direction = query.queryKey.at(-1);
  const itemId = query.queryKey[3];
  if (
    !selection.success ||
    typeof itemId !== "string" ||
    (direction !== "next" && direction !== "previous") ||
    _getCanonicalQuery(makeQueryFromSelection(selection.data).toString()) !==
      canonical
  ) {
    return undefined;
  }
  const data = query.state.data as MediaNeighborsResponse;
  const node = (preview: MediaPreview) => {
    return { itemId: preview.itemId, preview, pageIndex: 0 };
  };
  const before = direction === "next" ? data.behind : data.ahead;
  const after = direction === "next" ? data.ahead : data.behind;
  return {
    nodes: [
      ...before.toReversed().map(node),
      { itemId, pageIndex: 0 },
      ...after.map(node),
    ],
    metadataUpdatedAt: [
      (data as { metadataUpdatedAt?: number }).metadataUpdatedAt ??
        query.state.dataUpdatedAt,
    ],
    hasStart: before.length < (direction === "next" ? 1 : 2),
    hasEnd: after.length < (direction === "next" ? 2 : 1),
  };
}
function _getSequenceFromQuery({
  query,
  canonical,
}: {
  query: Query;
  canonical: string;
}): Sequence | undefined {
  if (
    query.queryKey.length === 3 &&
    typeof query.queryKey[2] === "string" &&
    _getCanonicalQuery(query.queryKey[2]) === canonical
  ) {
    return _getTimelineSequence(
      query.state.data as InfiniteData<TimelineQueryPage, string | undefined>,
    );
  }
  return query.queryKey[2] === "item-neighbours"
    ? _getNeighborhoodSequence({ query, canonical })
    : undefined;
}
/**
 * Uses only the existing member/selection cache inside its metadata freshness
 * window.
 */
export function getKnownMediaNeighborWindowFromQueries(
  options: Readonly<{
    queryClient: QueryClient;
    memberId: string;
    request: MediaNeighborsRequest;
  }>,
): KnownMediaNeighborWindow | undefined {
  const canonical = _getCanonicalQuery(
    makeQueryFromSelection(options.request.selection).toString(),
  );
  const queries = options.queryClient
    .getQueryCache()
    .findAll({ queryKey: ["timeline", options.memberId] });
  let matchedWindow: KnownMediaNeighborWindow | undefined;
  queries.some((query) => {
    if (query.state.isInvalidated || query.state.data === undefined) {
      return false;
    }
    const sequence = _getSequenceFromQuery({ query, canonical });
    matchedWindow =
      sequence === undefined
        ? undefined
        : _getWindowFromSequence({ sequence, request: options.request });
    return matchedWindow !== undefined;
  });
  return matchedWindow;
}
