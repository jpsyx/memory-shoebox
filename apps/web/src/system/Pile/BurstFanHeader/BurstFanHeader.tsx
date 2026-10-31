import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./BurstFanHeader.module.css";

type Props = {
  label: ReactNode;
  isDisabled?: boolean;
  selectionAction?: {
    isFullySelected: boolean;
    isDisabled: boolean;
    onSelect: () => void;
  };
  onCollapse: () => void;
};

/** Keeps the burst label and collapse control visible in either fan layout. */
export function BurstFanHeader({
  label,
  isDisabled,
  selectionAction,
  onCollapse,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.burstFanHeader}>
      <b className={classes.burstFanHeaderLabel}>{label}</b>
      {selectionAction ? (
        <Button
          variant="panel"
          size="sm"
          disabled={
            selectionAction.isDisabled || selectionAction.isFullySelected
          }
          onClick={selectionAction.onSelect}
        >
          {selectionAction.isFullySelected
            ? "Full burst selected"
            : "Select full burst"}
        </Button>
      ) : null}
      <Button
        disabled={isDisabled}
        variant="panel"
        size="sm"
        onClick={onCollapse}
      >
        Collapse
      </Button>
    </div>
  );
}
