import { type ReactNode } from "react";

import { DaySpine } from "@/system/Pile/DaySpine";

import { MilestoneBand } from "@/system/Pile/MilestoneBand";

import { MilestoneContinues } from "@/system/Pile/MilestoneContinues";

import { MilestoneEmptyPile } from "../../../DayBlock/MilestoneEmptyPile";

import classes from "./TimelineHeader.module.css";
import type { Props } from "../TimelineDayRows.types";
/** Renders the owned TimelineHeader portion of the timeline. */
export function TimelineHeader({
  row,
  countLabel,
  isMobile,
}: Readonly<Pick<Props, "row" | "countLabel" | "isMobile">>): ReactNode {
  return (
    <>
      {isMobile ? (
        <div className={classes.timelineHeaderMobileSpine}>
          <DaySpine day={row.day} countLabel={countLabel} />
        </div>
      ) : null}
      {row.day.milestoneBand ? (
        <MilestoneBand band={row.day.milestoneBand} />
      ) : null}
      {row.day.milestoneStrips.map((strip) => {
        return (
          <MilestoneContinues key={strip.milestone.milestoneId} strip={strip} />
        );
      })}
      {row.day.items.length === 0 ? <MilestoneEmptyPile /> : null}
    </>
  );
}
