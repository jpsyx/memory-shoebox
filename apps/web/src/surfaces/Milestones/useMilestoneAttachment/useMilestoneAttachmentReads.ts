import { makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity } from "@/api/milestoneHelpers/milestoneItemsQueryHelpers";
import type { TimelineSelection } from "@/api/timeline/selection/selection";
import { makeTimelineQueryOptionsFromView } from "@/api/timeline/timeline";
import type { TimelineResponse } from "@memory-shoebox/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getMilestoneEntriesFromBranches,
  type MilestoneAttachmentEntry,
} from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
type ReadOptions = {
  memberId: string;
  milestoneId: string;
  source: "span" | "archive";
  selection: TimelineSelection;
};
type ReadBranch = {
  hasNextPage: boolean;
  isFetching: boolean;
  isPending: boolean;
  isError: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};
type Reads = {
  entries: MilestoneAttachmentEntry[];
  hasMore: boolean;
  loadMore: () => void;
  isReading: boolean;
  retryReads: () => void;
  error: string | undefined;
};
function _getArchiveOptionsFromSelection({
  options,
  excludeAttached,
}: Readonly<{
  options: Readonly<ReadOptions>;
  excludeAttached: boolean;
}>): ReturnType<typeof makeTimelineQueryOptionsFromView> & {
  enabled: boolean;
} {
  return {
    ...makeTimelineQueryOptionsFromView({
      view: {
        selection: {
          ...options.selection,
          attachedToMilestoneId: options.milestoneId,
          excludeAttached,
        },
        at: undefined,
      },
      memberId: options.memberId,
    }),
    enabled: options.source === "archive",
  };
}
function _getArchiveEntriesFromPages({
  pages,
  isAttached,
}: Readonly<{
  pages: readonly TimelineResponse[];
  isAttached: boolean;
}>): MilestoneAttachmentEntry[] {
  return pages.flatMap((page) => {
    return page.days.flatMap((day) => {
      return day.items.map((item) => {
        return { item, isAttached };
      });
    });
  });
}
function _getReadStatusFromBranches(
  branches: readonly ReadBranch[],
): Omit<Reads, "entries"> {
  return {
    hasMore: branches.some((branch) => {
      return branch.hasNextPage;
    }),
    loadMore: () => {
      branches.forEach((branch) => {
        if (branch.isFetching) {
          return;
        }
        if (branch.isError) {
          void branch.refetch();
        } else if (branch.hasNextPage) {
          void branch.fetchNextPage();
        }
      });
    },
    retryReads: () => {
      branches.forEach((branch) => {
        if (!branch.isFetching) {
          void branch.refetch();
        }
      });
    },
    isReading: branches.some((branch) => {
      return branch.isFetching || branch.isPending;
    }),
    error: branches.some((branch) => {
      return branch.isError;
    })
      ? "Photographs could not be read. Your choices are kept. Retry the photographs."
      : undefined,
  };
}
/** Independent member/filter/cursor streams for the two picker modes. */
export function useMilestoneAttachmentReads(
  options: Readonly<ReadOptions>,
): Reads {
  const candidates = useInfiniteQuery({
    ...makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(options),
    enabled: options.source === "span",
  });
  const attached = useInfiniteQuery(
    _getArchiveOptionsFromSelection({ options, excludeAttached: false }),
  );
  const available = useInfiniteQuery(
    _getArchiveOptionsFromSelection({ options, excludeAttached: true }),
  );
  const branches =
    options.source === "span" ? [candidates] : [attached, available];
  const entries =
    options.source === "span"
      ? (candidates.data?.pages.flatMap((page) => {
          return page.candidates;
        }) ?? [])
      : [
          ..._getArchiveEntriesFromPages({
            pages: attached.data?.pages ?? [],
            isAttached: true,
          }),
          ..._getArchiveEntriesFromPages({
            pages: available.data?.pages ?? [],
            isAttached: false,
          }),
        ];
  return {
    entries: getMilestoneEntriesFromBranches(entries),
    ..._getReadStatusFromBranches(branches),
  };
}
