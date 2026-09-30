import type { DayMilestoneBand } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import classes from "@/system/system.module.css";

type Props = {
  band: DayMilestoneBand;
};

/**
 * A milestone sitting inline in the timeline. It reads as an occasion through
 * structural rules and figure type: there is no separate milestone view to
 * navigate to, and no card to put it in.
 *
 * A milestone is a span, so it appears twice over: the full band opens it on
 * the first of its days you meet, and every later day of the same occasion
 * carries the quiet continuation strip instead. Five days of a visit have to
 * read as one visit, not as five separate occasions that happen to share a
 * name.
 */
export function MilestoneBand({ band }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.milestoneBand}>
      <LabelText className={classes.spineMonth}>Milestone</LabelText>
      <p className={classes.milestoneName}>{band.milestone.name}</p>
      <p className={classes.milestoneMeta}>
        <span>{milestoneDatesLabel(band.milestone)}</span>
        {band.dayCount === 1 ? null : <span>{band.dayCount} days</span>}
        <span>
          {band.itemCount} {band.itemCount === 1 ? "item" : "items"}
        </span>
        {band.milestone.blurb === null ? null : (
          <span>{band.milestone.blurb}</span>
        )}
      </p>
      {band.dayCount === 1 ? null : (
        <p className={classes.milestoneMeta}>
          <span>
            This day is day {band.dayPosition} of the {band.dayCount}.
          </span>
        </p>
      )}
    </div>
  );
}
