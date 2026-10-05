import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import type { MilestoneSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { MilestoneSearch } from "../../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import type { Props as OwnerProps } from "../MilestoneList";
import { MilestoneActions } from "./MilestoneActions/MilestoneActions";
import classes from "./MilestoneRow.module.css";
type Props = {
  row: MilestoneSummary;
  onNavigate: OwnerProps["onNavigate"];
};
/** Presents milestone row. */
export function MilestoneRow({ row, onNavigate }: Readonly<Props>): ReactNode {
  const { milestone } = row;
  const onOpen = (mode: MilestoneSearch["mode"]) => {
    return onNavigate({ milestone: milestone.milestoneId, mode });
  };
  return (
    <li className={classes.milestoneRowRoot}>
      <div className={classes.milestoneRowWords}>
        <b>{milestone.name}</b>
        {milestone.blurb ? <p>{milestone.blurb}</p> : null}
      </div>
      <div className={classes.milestoneRowFacts}>
        <span>{milestoneDatesLabel(milestone)}</span>
        <span>
          {row.itemCount} {row.itemCount === 1 ? "item" : "items"}
        </span>
      </div>
      <MilestoneActions row={row} onOpen={onOpen} />
    </li>
  );
}
