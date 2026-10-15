import { useContext, type ReactNode } from "react";

import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";

import classes from "@/system/system.module.css";
import type { Props } from "./TimelineDayRows.types";
import { TimelineRowContent } from "./TimelineRowContent";
/** Renders the owned MeasuredRow portion of the timeline. */
export function MeasuredRow(
  props: Readonly<
    Props & {
      index: number;
      top: number;
      measure: (element: HTMLElement | null) => void;
    }
  >,
): ReactNode {
  const selection = useContext(PileSelectionContext);
  const { row } = props;
  return (
    <div
      data-index={props.index}
      data-timeline-row={row.key}
      data-fan-row={row.burstId}
      data-restore-burst={
        row.isFanHeader && row.reservedHeight !== undefined
          ? row.burstId
          : undefined
      }
      ref={props.measure}
      className={`${classes.timelineRow} ${row.burstId ? classes.timelineFan : ""} ${row.isLast ? classes.timelineLastRow : ""} ${row.isFanHeader ? classes.timelineFanHeader : ""}`}
      style={{
        top: row.isFanHeader ? undefined : props.top,
        minHeight: row.reservedHeight,
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          row.burstId &&
          !selection?.framesByBurstId.has(row.burstId)
        ) {
          props.onCollapseBurst?.(row.burstId);
        }
      }}
    >
      <TimelineRowContent {...props} />
    </div>
  );
}
