import { ChipRow } from "@/system/Chip/ChipRow";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { Props as OwnerProps } from "../MilestoneReconcileControls";
import classes from "./MilestoneReconcileLinks.module.css";
type Props = OwnerProps;
/** Presents milestone reconcile links. */
export function MilestoneReconcileLinks({
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
              root: classes.milestoneReconcileLinksButton,
              label: classes.milestoneReconcileLinksLabel,
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
