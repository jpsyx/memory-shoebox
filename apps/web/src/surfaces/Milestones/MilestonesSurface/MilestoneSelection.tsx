import { Button } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { milestoneDetailQueryOptions } from "@/api/milestoneHelpers/milestonesQueryHelpers";
import { Prose } from "@/system/typography/Prose";
import { MilestoneStep } from "./MilestoneStep";
type Props = Omit<ComponentProps<typeof MilestoneStep>, "detail"> & {
  milestoneId: string;
};
function _MilestoneSelectionError({
  onRefresh,
  onCancel,
}: Readonly<{ onRefresh: () => void; onCancel: () => void }>): ReactNode {
  return (
    <>
      <Prose onPanel role="alert">
        This occasion could not be read. Refresh it or return to the list.
      </Prose>
      <Button variant="default" onClick={onRefresh}>
        Refresh the occasion
      </Button>
      <Button variant="default" onClick={onCancel}>
        Back to the list
      </Button>
    </>
  );
}
/** Fetches authoritative selected detail before mounting any existing write. */
export function MilestoneSelection(options: Readonly<Props>): ReactNode {
  const query = useQuery(
    milestoneDetailQueryOptions({
      memberId: options.memberId,
      milestoneId: options.milestoneId,
    }),
  );
  if (query.isPending) {
    return (
      <Prose onPanel role="status">
        Reading the occasion.
      </Prose>
    );
  }
  const readFailure = query.isError ? (
    <_MilestoneSelectionError
      onRefresh={() => {
        void query.refetch();
      }}
      onCancel={() => {
        options.onNavigate({});
      }}
    />
  ) : null;
  if (
    query.data === undefined ||
    (query.isError &&
      !["edit", "created", "attach", "fix"].includes(options.mode ?? ""))
  ) {
    return readFailure;
  }
  return (
    <>
      {readFailure}
      <MilestoneStep
        key={`${options.memberId}:${options.milestoneId}:${options.mode}`}
        {...options}
        detail={query.data}
        hasUsableAuthority={!query.isError && !query.isFetching}
      />
    </>
  );
}
