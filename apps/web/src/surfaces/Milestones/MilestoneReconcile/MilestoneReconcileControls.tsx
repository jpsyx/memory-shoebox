import classes from "./MilestoneReconcileControls.module.css";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import type { useMilestoneReconcile } from "../useMilestoneReconcile/useMilestoneReconcile";
type Props = {
  controller: ReturnType<typeof useMilestoneReconcile>;
  onDone: () => void;
  onOtherMilestone: (milestoneId: string) => void;
};
function _MilestoneReconcilePaging({
  controller,
}: Readonly<Pick<Props, "controller">>): ReactNode {
  return (
    <>
      {controller.hasMore ? (
        <Button
          variant="panel"
          classNames={{
            root: classes.milestoneReconcileControl,
            label: classes.milestoneReconcileControlLabel,
          }}
          disabled={controller.isPending}
          onClick={controller.loadMore}
        >
          Show more photographs (up to 500 per batch)
        </Button>
      ) : null}
      {controller.strays.length === 500 ? (
        <Prose onPanel>
          Showing the maximum batch of 500. Save this batch to read the
          remaining mismatches.
        </Prose>
      ) : null}
    </>
  );
}
function _MilestoneReconcileLinks({
  controller,
  onDone,
  onOtherMilestone,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {controller.raisedElsewhere.map(({ milestone }) => {
        return (
          <Button
            key={milestone.milestoneId}
            variant="panel"
            classNames={{
              root: classes.milestoneReconcileControl,
              label: classes.milestoneReconcileControlLabel,
            }}
            disabled={controller.isPending}
            onClick={() => {
              return onOtherMilestone(milestone.milestoneId);
            }}
          >
            Fix dates for {milestone.name}
          </Button>
        );
      })}
      <Button
        variant="default"
        bg="var(--print)"
        disabled={controller.isPending && !controller.hasReadError}
        onClick={onDone}
      >
        Back to the list
      </Button>
    </ChipRow>
  );
}
/** Presents confirmed counts, remaining batch continuation and named fixes. */
export function MilestoneReconcileControls(
  options: Readonly<Props>,
): ReactNode {
  const { controller } = options;
  return (
    <>
      {controller.result !== undefined ? (
        <Prose onPanel role="status">
          {controller.result}
        </Prose>
      ) : null}
      {controller.detail.mismatchCount === 0 &&
      controller.error !== undefined ? (
        <Prose onPanel role="alert">
          {controller.error}
        </Prose>
      ) : null}
      <_MilestoneReconcilePaging controller={controller} />
      <_MilestoneReconcileLinks {...options} />
    </>
  );
}
