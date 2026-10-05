import { makeMilestonesInfiniteQueryOptionsFromMemberId } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { Button, Stack } from "@mantine/core";
import type {
  ListMilestonesResponse,
  MilestoneSummary,
} from "@memory-shoebox/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MilestoneList } from "../../MilestoneList/MilestoneList";
import type { MilestoneSearch } from "../../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import { MilestoneDirectoryReadState } from "./MilestoneDirectoryReadState";
/** Signed-in viewer and occasion directory navigation. */
export type Props = {
  viewer: Viewer;
  onNavigate: (search: MilestoneSearch) => void;
};
function _getMilestonesFromPages(
  pages: readonly ListMilestonesResponse[],
): MilestoneSummary[] {
  const identities = pages
    .flatMap((page) => {
      return page.milestones;
    })
    .map((row) => {
      return [row.milestone.milestoneId, row] as const;
    });
  return [...new Map(identities).values()];
}
/** Pages remain member-scoped; empty cursor pages still offer continuation. */
export function MilestoneDirectory({
  viewer,
  onNavigate,
}: Readonly<Props>): ReactNode {
  const query = useInfiniteQuery(
    makeMilestonesInfiniteQueryOptionsFromMemberId(viewer.memberId),
  );
  const milestones = _getMilestonesFromPages(query.data?.pages ?? []);
  return (
    <Stack gap="md">
      <MilestoneDirectoryReadState
        isPending={query.isPending}
        isError={query.isError}
        onRefresh={() => {
          void query.refetch();
        }}
      />
      {query.data ? (
        <MilestoneList
          milestones={milestones}
          canCreate={
            viewer.role !== "viewer" && !query.isError && !query.isFetching
          }
          onNavigate={onNavigate}
        />
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="panel"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Load more milestones
        </Button>
      ) : null}
    </Stack>
  );
}
