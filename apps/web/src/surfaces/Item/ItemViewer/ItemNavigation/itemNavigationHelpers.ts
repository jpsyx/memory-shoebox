import {
  timelineResponseSchema,
  type BurstFrameRef,
  type ItemSummary,
} from "@memory-shoebox/shared";
import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import { getBurstFramesForSelection } from "@/api/bulkItems/getBurstFramesForSelection";
import {
  isSelectionActive,
  makeQueryFromSelection,
} from "@/api/timeline/selection/selection";
import { timelineRailQueryOptions } from "@/api/timeline/timeline";
import type {
  ItemDirection,
  ItemNavigationContext,
  ItemNavigationTarget,
} from "./itemNavigation.types";

/** Reads one atomic timeline day; the query never counts an item open. */
async function _getDayItems(
  options: Readonly<{ context: ItemNavigationContext; capturedOn: string }>,
): Promise<ItemSummary[]> {
  const { context, capturedOn } = options;
  const searchParams = makeQueryFromSelection({
    ...context.selection,
    from: capturedOn,
    until: capturedOn,
  });
  const page = await context.queryClient.fetchQuery({
    queryKey: [
      "timeline",
      context.memberId,
      "viewer-day",
      searchParams.toString(),
    ],
    queryFn: ({ signal }) => {
      return apiFetch({
        path: makePathFromSearchParams({ basePath: "/timeline", searchParams }),
        schema: timelineResponseSchema,
        init: { signal },
      });
    },
    staleTime: 30_000,
  });
  return (
    page.days.find((day) => {
      return day.capturedOn === capturedOn;
    })?.items ?? []
  );
}

/** Complete matching frames, scoped to the current member and filter. */
export async function getNavigationFramesFromBurstId(
  options: Readonly<{ context: ItemNavigationContext; burstId: string }>,
): Promise<BurstFrameRef[]> {
  const { context, burstId } = options;
  return context.queryClient.fetchQuery({
    queryKey: [
      "bursts",
      burstId,
      "navigation",
      context.memberId,
      makeQueryFromSelection(context.selection).toString(),
    ],
    queryFn: () => {
      return getBurstFramesForSelection(burstId, context.selection);
    },
    staleTime: 30_000,
  });
}

async function _getCurrentFrames(
  context: Readonly<ItemNavigationContext>,
): Promise<BurstFrameRef[]> {
  const { detail, selection } = context;
  if (detail.burst === null) {
    return [];
  }
  if (
    !isSelectionActive(selection) &&
    detail.burstFrames.length === detail.burst.visibleFrameCount
  ) {
    return detail.burstFrames;
  }
  return getNavigationFramesFromBurstId({
    context,
    burstId: detail.burst.burstId,
  });
}

async function _getAdjacentDayItem(
  options: Readonly<{
    context: ItemNavigationContext;
    direction: ItemDirection;
  }>,
): Promise<ItemSummary | undefined> {
  const { context, direction } = options;
  const railOptions = timelineRailQueryOptions(context.selection);
  const rail = await context.queryClient.fetchQuery({
    ...railOptions,
    queryKey: [...railOptions.queryKey, context.memberId],
    staleTime: 30_000,
  });
  const days = rail.days.filter((day) => {
    return day.itemCount > 0;
  });
  const day =
    direction === "previous"
      ? days.findLast((candidate) => {
          return candidate.capturedOn > context.detail.capturedOn;
        })
      : days.find((candidate) => {
          return candidate.capturedOn < context.detail.capturedOn;
        });
  if (day === undefined) {
    return undefined;
  }
  const items = await _getDayItems({ context, capturedOn: day.capturedOn });
  return direction === "previous" ? items.at(-1) : items[0];
}

type NeighbourOptions = {
  context: ItemNavigationContext;
  items: readonly ItemSummary[];
  frames: readonly BurstFrameRef[];
  itemIndex: number;
  direction: ItemDirection;
};

async function _getTargetFromNeighbours(
  options: Readonly<NeighbourOptions>,
): Promise<ItemNavigationTarget | undefined> {
  const { context, items, frames, itemIndex, direction } = options;
  const frameIndex = frames.findIndex((frame) => {
    return frame.itemId === options.context.detail.itemId;
  });

  const offset = direction === "previous" ? -1 : 1;
  const frame = frameIndex < 0 ? undefined : frames[frameIndex + offset];
  if (frame !== undefined) {
    return { itemId: frame.itemId };
  }
  const item =
    items[itemIndex + offset] ??
    (await _getAdjacentDayItem({ context, direction }));
  return item === undefined
    ? undefined
    : { itemId: item.itemId, burstId: item.burst?.burstId };
}

/** Neighbours follow the server's pile order, expanding only the already-open stack. */
export async function getItemNeighboursFromDetail(
  context: Readonly<ItemNavigationContext>,
): Promise<Record<ItemDirection, ItemNavigationTarget | undefined>> {
  const [items, frames] = await Promise.all([
    _getDayItems({ context, capturedOn: context.detail.capturedOn }),
    _getCurrentFrames(context),
  ]);
  const itemIndex = items.findIndex((item) => {
    return (
      item.itemId === context.detail.itemId ||
      (item.burst !== null &&
        item.burst.burstId === context.detail.burst?.burstId)
    );
  });
  if (itemIndex < 0) {
    return { previous: undefined, next: undefined };
  }
  const [previous, next] = await Promise.all([
    _getTargetFromNeighbours({
      context,
      items,
      frames,
      itemIndex,
      direction: "previous",
    }),
    _getTargetFromNeighbours({
      context,
      items,
      frames,
      itemIndex,
      direction: "next",
    }),
  ]);
  return { previous, next };
}
