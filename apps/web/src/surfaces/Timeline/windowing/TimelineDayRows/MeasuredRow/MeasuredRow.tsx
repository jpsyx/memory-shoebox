import { useContext, type ReactNode } from "react";

import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";

import classes from "./MeasuredRow.module.css";
import { clsx } from "clsx";
import type { Props as RowProps } from "../TimelineDayRows.types";
import { TimelineRowContent } from "../TimelineRowContent";
type Props = RowProps & {
  index: number;
  top: number;
  measure: (element: HTMLElement | null) => void;
};

/** Renders the owned MeasuredRow portion of the timeline. */
export function MeasuredRow({
  row,
  countLabel,
  isMobile,
  onOpenBurst,
  onCollapseBurst,
  onOpenItem,
  index,
  top,
  measure,
}: Readonly<Props>): ReactNode {
  const selection = useContext(PileSelectionContext);
  return (
    <div
      data-index={index}
      data-timeline-row={row.key}
      data-fan-row={row.burstId}
      data-restore-burst={
        row.isFanHeader && row.reservedHeight !== undefined
          ? row.burstId
          : undefined
      }
      ref={measure}
      className={clsx(
        classes.measuredRow,
        row.burstId && classes.measuredRowFan,
        row.isLast && classes.measuredRowLast,
        row.isFanHeader && classes.measuredRowFanHeader,
      )}
      style={{
        top: row.isFanHeader ? undefined : top,
        minHeight: row.reservedHeight,
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          row.burstId &&
          !selection?.framesByBurstId.has(row.burstId)
        ) {
          onCollapseBurst?.(row.burstId);
        }
      }}
    >
      <TimelineRowContent
        {...{
          row,
          countLabel,
          isMobile,
          onOpenBurst,
          onCollapseBurst,
          onOpenItem,
        }}
      />
    </div>
  );
}
