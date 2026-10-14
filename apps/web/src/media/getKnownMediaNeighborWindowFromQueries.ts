import {
  timelineSelectionSchema,
  type MediaNeighborsRequest,
  type MediaNeighborsResponse,
  type MediaPreview,
  type TimelineResponse,
} from "@memory-shoebox/shared";
import type { InfiniteData, QueryClient, Query } from "@tanstack/react-query";
import { makeQueryFromSelection } from "@/api/timeline/selection/selection";

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
type Sequence = {
  nodes: Array<KnownMediaNeighbor | undefined>;
  hasStart: boolean;
  hasEnd: boolean;
};

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
function _getWindowFromSequence(
  sequence: Sequence,
  request: MediaNeighborsRequest,
): Omit<KnownMediaNeighborWindow, "metadataUpdatedAt"> | undefined {
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
  return request.direction === "next"
    ? { ahead: following, behind: previous }
    : { ahead: previous, behind: following };
}
function _getTimelineSequence(
  data: InfiniteData<TimelineResponse, string | null>,
): Sequence | undefined {
  if (data.pages.length === 0 || data.pages.length !== data.pageParams.length) {
    return undefined;
  }
  const nodes = data.pages.flatMap((page, index) => {
    const gap =
      index > 0 &&
      (data.pages[index - 1]?.nextCursor === null ||
        data.pages[index - 1]?.nextCursor !== data.pageParams[index]);
    return [
      ...(gap ? [undefined] : []),
      ...page.days.flatMap((day) => {
        return day.items.map((item) => {
          return {
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
    hasStart: data.pageParams[0] === null,
    hasEnd: data.pages.at(-1)?.nextCursor === null,
  };
}
function _getNeighborhoodSequence(
  query: Query,
  canonical: string,
): Sequence | undefined {
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
    return { itemId: preview.itemId, preview };
  };
  const before = direction === "next" ? data.behind : data.ahead;
  const after = direction === "next" ? data.ahead : data.behind;
  return {
    nodes: [...before.toReversed().map(node), { itemId }, ...after.map(node)],
    hasStart: before.length < (direction === "next" ? 1 : 2),
    hasEnd: after.length < (direction === "next" ? 2 : 1),
  };
}
function _getSequenceFromQuery(
  query: Query,
  canonical: string,
): Sequence | undefined {
  if (
    query.queryKey.length === 3 &&
    typeof query.queryKey[2] === "string" &&
    _getCanonicalQuery(query.queryKey[2]) === canonical
  ) {
    return _getTimelineSequence(
      query.state.data as InfiniteData<TimelineResponse, string | null>,
    );
  }
  return query.queryKey[2] === "item-neighbours"
    ? _getNeighborhoodSequence(query, canonical)
    : undefined;
}
/** Uses only the existing member/selection cache inside its metadata freshness window. */
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
  for (const query of queries) {
    const metadataUpdatedAt =
      (query.state.data as { metadataUpdatedAt?: number } | undefined)
        ?.metadataUpdatedAt ?? query.state.dataUpdatedAt;
    if (
      query.state.isInvalidated ||
      query.state.data === undefined ||
      metadataUpdatedAt <= Date.now() - 30_000
    ) {
      continue;
    }
    const sequence = _getSequenceFromQuery(query, canonical);
    const window =
      sequence === undefined
        ? undefined
        : _getWindowFromSequence(sequence, options.request);
    if (window !== undefined) {
      return { ...window, metadataUpdatedAt };
    }
  }
  return undefined;
}
