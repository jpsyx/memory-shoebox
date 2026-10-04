import { Button } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { MilestoneDetail } from "@memory-shoebox/shared";
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
  if (query.isError) {
    return (
      <_MilestoneSelectionError
        onRefresh={() => {
          void query.refetch();
        }}
        onCancel={() => {
          return options.onNavigate({});
        }}
      />
    );
  }
  const detail: MilestoneDetail = query.data;
  return (
    <MilestoneStep
      key={`${options.memberId}:${options.milestoneId}:${options.mode}`}
      {...options}
      detail={detail}
    />
  );
}
