import { useTimelineRecovery } from "../useTimelineRecovery/useTimelineRecovery";

import { useContext } from "react";

import { MediaLoadingContext } from "@/media/MediaLoadingContext";

import { createTimelineMemory } from "../../windowing/createTimelineMemory/createTimelineMemory";

import type {
  TimelineAnchor,
  TimelineExpansion,
} from "../../windowing/timelineWindow.types";

import {
  useTimelinePaging,
  type TimelinePaging,
} from "@/api/timeline/useTimelinePaging/useTimelinePaging";

import { meQueryOptions } from "@/api/me/me";

import { markItemsSeen } from "@/api/seen/seen";

import {
  getViewFromSearch,
  isSelectionActive,
  type TimelineSearch,
  type TimelineView,
} from "@/api/timeline/selection/selection";

import {
  makeTimelineQueryOptionsFromView,
  timelineRailQueryOptions,
  type TimelineQueryPage,
} from "@/api/timeline/timeline";

import { makeFilterFacetsQueryOptionsFromSelection } from "@/api/vocabularies/vocabularies";

import { useBurstFan } from "@/surfaces/Timeline/TimelineSurface/useBurstFan/useBurstFan";

import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

import type {
  BurstFrameRef,
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
 *
 * Bundled so `useTimelineData` needs one more call rather than three.
 */
function usePileControls(options: {
  queryClient: QueryClient;
  days: readonly TimelineDay[];
  viewKey: string;
  memory: ReturnType<typeof createTimelineMemory>;
}): {
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
  restoreBurst: (
    burstId: string,
  ) => Promise<readonly BurstFrameRef[] | undefined>;
  onClearBursts: () => void;
  archiveRef: RefCallback<HTMLElement>;
  expanded: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst: (burstId: string) => void;
} {
  const {
    framesByBurstId,
    onOpenBurst,
    restoreBurst,
    onClearBursts,
    expanded,
    onCollapseBurst,
  } = useBurstFan(options.queryClient, {
    memory: options.memory,
    viewKey: options.viewKey,
    retainedBurstIds: new Set(
      options.days.flatMap((day) => {
        return day.items.flatMap((item) => {
          return item.burst ? [item.burst.burstId] : [];
        });
      }),
    ),
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
function useTimelineStream(view: Readonly<TimelineView>): {
  stream: UseInfiniteQueryResult<
    InfiniteData<TimelineQueryPage, string | null>
  >;
  paging: TimelinePaging;
  role: MemberRole | undefined;
  queryKey: string[];
  isRecovering: boolean;
  recoverPage: (anchor: TimelineAnchor) => Promise<void>;
} {
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
    initialPageParam: saved?.pageCursor ?? null,
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
export function useTimelineData(search: TimelineSearch): TimelineData {
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
        stream.data?.pages[0]?.resultCount,
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
          return [
            day.capturedOn,
            stream.data!.pageParams[index] ?? null,
          ] as const;
        });
      }),
    ),
  };
}
