import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./BurstFanHeader.module.css";

type Props = {
  label: ReactNode;
  isDisabled?: boolean;
  onCollapse: () => void;
};

/** Keeps the burst label and collapse control visible in either fan layout. */
export function BurstFanHeader({
  label,
  isDisabled,
  onCollapse,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.burstFanHeader}>
      <b className={classes.burstFanHeaderLabel}>{label}</b>
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
