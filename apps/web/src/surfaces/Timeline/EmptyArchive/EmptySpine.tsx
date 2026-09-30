import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  /** The word under the nought: "Photos" for a member who can put things up. */
  unitLabel: string;
};

/** The fake spine above the copy: a footprint, never a counted real day. */
export function EmptySpine({ unitLabel }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.spine}>
      <p className={classes.spineFigure}>0</p>
      <LabelText className={classes.spineMonth}>{unitLabel}</LabelText>
      <p className={classes.spineCount}>
        0 <span className={classes.spineCountLabel}>days</span>
      </p>
    </div>
  );
}
