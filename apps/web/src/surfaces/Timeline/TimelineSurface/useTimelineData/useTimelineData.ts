import { useTimelineRecovery } from "../useTimelineRecovery/useTimelineRecovery";

import { useContext } from "react";

import { MediaLoadingContext } from "@/media/MediaLoadingContext";

import { createTimelineMemory } from "../../windowing/createTimelineMemory/createTimelineMemory";

import type { TimelineAnchor } from "../../windowing/timelineWindow.types";

import {
  useTimelinePaging,
  type TimelinePaging,
} from "@/api/timelineHelpers/useTimelinePaging";

import { meQueryOptions } from "@/api/me/me";

import { markItemsSeen } from "@/api/seen/seen";

import {
  getViewFromSearch,
  isSelectionActive,
  type TimelineSearch,
  type TimelineView,
} from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";

import {
  makeTimelineQueryOptionsFromView,
  timelineRailQueryOptions,
  type TimelineQueryPage,
} from "@/api/timelineHelpers/timelineHelpers";

import { makeFilterFacetsQueryOptionsFromSelection } from "@/api/vocabularies/vocabularies";

import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";

import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

import type {
  ItemsSeenRequest,
  MemberRole,
  TimelineDay,
} from "@memory-shoebox/shared";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";

import { useNavigate } from "@tanstack/react-router";

import { type RefCallback } from "react";

import { type TimelineData } from "./useTimelineData.types";
type TimelineStream = {
  stream: UseInfiniteQueryResult<
    InfiniteData<TimelineQueryPage, string | undefined>
  >;
  paging: TimelinePaging;
  role: MemberRole | undefined;
  queryKey: string[];
  isRecovering: boolean;
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
};

type PileControlOptions = {
  queryClient: QueryClient;
  days: readonly TimelineDay[];
  viewKey: string;
  memory: ReturnType<typeof createTimelineMemory>;
};

export type { TimelineData } from "./useTimelineData.types";

import {
  getDaysFromTimelinePages,
  getUnseenStateFromDays,
  makeTimelineDataFromQuery,
  makeTimelineHandlersFromOptions,
} from "./timelineDataHelpers";

/**
 * Posts a latched batch, and never bothers anybody when it fails.
 *
 * The latch is one-way, so nothing is refetched here: the client already
 * knows the answer, and asking for it again would be the write it avoided
 * plus a read. A failed post is not worth surfacing either: the dots stay on
 * and the next pass over the same print tries again.
 */
function _onSeenLatch(body: ItemsSeenRequest): void {
  void markItemsSeen(body).catch(() => {
    // Silently retried the next time the print or stack is on screen.
  });
}

/**
 * The burst fan and the seen latch: the two things this surface reaches into
 * the rendered DOM for, rather than only reading from TanStack Query.
 */
function usePileControls(
  options: PileControlOptions,
): ReturnType<typeof useBurstFan> & { archiveRef: RefCallback<HTMLElement> } {
  const {
    framesByBurstId,
    onOpenBurst,
    restoreBurst,
    onClearBursts,
    expanded,
    onCollapseBurst,
  } = useBurstFan({
    queryClient: options.queryClient,
    options: {
      memory: options.memory,
      viewKey: options.viewKey,
      retainedBurstIds: new Set(
        options.days.flatMap((day) => {
          return day.items.flatMap((item) => {
            return item.burst ? [item.burst.burstId] : [];
          });
        }),
      ),
    },
  });
  const archiveRef = useSeenLatch({
    ownerKey: options.viewKey,
    unseenById: getUnseenStateFromDays(options.days),
    onLatch: _onSeenLatch,
  });
  return {
    framesByBurstId,
    onOpenBurst,
    restoreBurst,
    onClearBursts,
    archiveRef,
    expanded,
    onCollapseBurst,
  };
}

/**
 * The member-bound stream and both callbacks sharing its current fetch slot.
 */
function useTimelineStream(view: Readonly<TimelineView>): TimelineStream {
  const me = useQuery(meQueryOptions);
  const memberId = me.data?.me.member.memberId;
  const streamOptions = makeTimelineQueryOptionsFromView({ view, memberId });
  const recovery = useTimelineRecovery({
    view,
    queryKey: streamOptions.queryKey,
  });
  const resources = useContext(MediaLoadingContext);
  const saved = resources?.timeline.get(
    JSON.stringify(streamOptions.queryKey),
  ).anchor;
  const stream = useInfiniteQuery({
    ...streamOptions,
    initialPageParam: saved?.pageCursor,
    enabled: memberId !== undefined && !recovery.isRecovering,
  });
  const paging = useTimelinePaging({
    queryKey: streamOptions.queryKey,
    stream,
  });
  return {
    stream,
    paging: {
      onReachStart: () => {
        if (!recovery.isPending()) {
          paging.onReachStart();
        }
      },
      onReachEnd: () => {
        if (!recovery.isPending()) {
          paging.onReachEnd();
        }
      },
    },
    isRecovering: recovery.isRecovering,
    role: me.data?.me.role,
    queryKey: streamOptions.queryKey,
    recoverPage: recovery.recoverPage,
  };
}

/** The member-bound stream, complete rail, facets and pile controls. */
export function useTimelineData(
  search: Readonly<TimelineSearch>,
): TimelineData {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const view = getViewFromSearch(search);
  const { selection } = view;
  const { stream, paging, role, queryKey, recoverPage, isRecovering } =
    useTimelineStream(view);
  const resources = useContext(MediaLoadingContext);
  const viewKey = JSON.stringify(queryKey);
  const rail = useQuery(timelineRailQueryOptions(selection));
  const facets = useQuery({
    ...makeFilterFacetsQueryOptionsFromSelection({ selection }),
    enabled: isSelectionActive(selection) || search.find === true,
  });
  const days = getDaysFromTimelinePages(stream.data?.pages);
  const {
    framesByBurstId,
    onOpenBurst,
    restoreBurst,
    onClearBursts,
    archiveRef,
    expanded,
    onCollapseBurst,
  } = usePileControls({
    memory: resources?.timeline ?? createTimelineMemory(),
    viewKey,
    queryClient,
    days,
  });
  const { onSelectionChange, onClearFilters, onRestart, onOpenItem } =
    makeTimelineHandlersFromOptions({ navigate, search });
  return {
    ...makeTimelineDataFromQuery({
      search,
      selection,
      role,
      days,
      railDays: rail.data?.days ?? [],
      resultCount:
        stream.data?.pages[0]?.selectionResultCount ??
        stream.data?.pages[0]?.resultCount ??
        undefined,
      facets: facets.data,
      framesByBurstId,
      isStreamSuccess: stream.isSuccess,
      hasNextPage: stream.hasNextPage,
      ...paging,
      onSelectionChange,
      onClearFilters,
      onRestart,
    }),
    onOpenBurst,
    restoreBurst,
    onClearBursts,
    onOpenItem,
    archiveRef,
    hasPrevious: stream.hasPreviousPage,
    isFetching: stream.isFetching || isRecovering,
    viewKey,
    expanded,
    onCollapseBurst,
    recoverPage,
    pageCursors: new Map(
      stream.data?.pages.flatMap((page, index) => {
        return page.days.map((day) => {
          return [day.capturedOn, stream.data!.pageParams[index]] as const;
        });
      }),
    ),
  };
}
