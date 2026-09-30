import type { DayMilestoneStrip } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import classes from "@/system/system.module.css";

type Props = {
  strip: DayMilestoneStrip;
};

/** The same occasion, on a later day of its own span. */
export function MilestoneContinues({ strip }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.milestoneContinues}>
      <span className={classes.milestoneContinuesDay}>
        Milestone · day {strip.dayPosition} of {strip.dayCount}
      </span>
      <span className={classes.milestoneContinuesName}>
        {strip.milestone.name}
      </span>
    </div>
  );
}
