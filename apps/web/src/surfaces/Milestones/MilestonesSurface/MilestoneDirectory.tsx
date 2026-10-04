import { Button, Stack } from "@mantine/core";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  ListMilestonesResponse,
  MilestoneSummary,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { milestonesInfiniteQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { Prose } from "@/system/typography/Prose";
import { MilestoneList } from "../MilestoneList/MilestoneList";
import type { MilestoneSearch } from "../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
type Props = { viewer: Viewer; onNavigate: (search: MilestoneSearch) => void };
function _MilestoneDirectoryReadState({
  isPending,
  isError,
  onRefresh,
}: Readonly<{
  isPending: boolean;
  isError: boolean;
  onRefresh: () => void;
}>): ReactNode {
  return (
    <>
      {isPending ? (
        <Prose onPanel role="status">
          Reading milestones.
        </Prose>
      ) : null}
      {isError ? (
        <>
          <Prose onPanel role="alert">
            Milestones could not be refreshed. Refresh the list before starting
            another change.
          </Prose>
          <Button variant="default" onClick={onRefresh}>
            Refresh the list
          </Button>
        </>
      ) : null}
    </>
  );
}
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
    milestonesInfiniteQueryOptions(viewer.memberId),
  );
  const milestones = _getMilestonesFromPages(query.data?.pages ?? []);
  return (
    <Stack gap="md">
      <_MilestoneDirectoryReadState
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
          variant="default"
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
