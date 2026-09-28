import type { ReactNode } from "react";
import { dayNumberLabel, monthLabel } from "@/system/labelHelpers/labelHelpers";
import type { TimelineDay } from "@/system/Pile/timeline.types";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  day: TimelineDay;
  /**
   * The unit word beside the count. "photos" unless a filter says otherwise.
   */
  countLabel?: string;
};

/**
 * The date spine: the fixed legend that a drifting field runs under. Sticky
 * on desktop, an opaque in-flow baseline row below 44rem, and never a
 * floating translucent header.
 */
export function DaySpine({ day, countLabel }: Readonly<Props>): ReactNode {
  const unit = countLabel ?? (day.itemCount === 1 ? "photo" : "photos");
  const milestoneEntries =
    day.milestoneBand === null
      ? day.milestoneStrips
      : [day.milestoneBand, ...day.milestoneStrips];

  return (
    <div className={classes.spine}>
      <p className={classes.spineFigure}>{dayNumberLabel(day.capturedOn)}</p>
      <LabelText className={classes.spineMonth}>
        {monthLabel(day.capturedOn)}
      </LabelText>
      <p className={classes.spineCount}>
        {day.itemCount.toLocaleString("en-GB")}{" "}
        <span className={classes.spineCountLabel}>{unit}</span>
      </p>
      {day.unseenCount > 0 ? (
        <p className={classes.unseen}>{day.unseenCount} new</p>
      ) : null}
      {milestoneEntries.map((entry) => {
        return (
          <div
            className={classes.spineMilestone}
            key={entry.milestone.milestoneId}
          >
            <LabelText>
              {entry.dayCount === 1
                ? "Milestone"
                : `Milestone · day ${entry.dayPosition} of ${entry.dayCount}`}
            </LabelText>
            <p className={classes.spineMilestoneName}>{entry.milestone.name}</p>
          </div>
        );
      })}
    </div>
  );
}
