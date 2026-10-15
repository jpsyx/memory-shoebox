import { DaySpine } from "@/system/Pile/DaySpine";

import classes from "@/system/system.module.css";

import type { TimelineDay } from "@memory-shoebox/shared";

import { type ReactNode } from "react";

import { TimelineDayRows } from "../windowing/TimelineDayRows/TimelineDayRows";

import type { StreamProps } from "./DayStream.types";
/** Renders the owned StreamDay portion of the timeline. */
export function StreamDay({
  props,
  stream,
  day,
  visible,
  onCollapseBurst,
}: StreamProps & {
  day: TimelineDay;
  visible: ReadonlySet<number>;
}): ReactNode {
  const { rows, layout, windowing } = stream;
  const indexes = rows.flatMap((row, index) => {
    return row.day.capturedOn === day.capturedOn ? [index] : [];
  });
  const first = windowing.measurements[indexes[0] ?? 0];
  const last = windowing.measurements[indexes.at(-1) ?? 0];
  const height = first && last ? last.end - first.start : 0;
  return (
    <section
      id={`day-${day.capturedOn}`}
      className={`${classes.day} ${classes.timelineDay}`}
      style={{ height }}
    >
      {!layout.isMobile ? (
        <div className={classes.timelineDesktopSpine}>
          <DaySpine day={day} countLabel={props.countLabel} />
        </div>
      ) : null}
      <div data-timeline-pile className={classes.timelinePile}>
        <TimelineDayRows
          isMobile={layout.isMobile}
          rows={rows}
          indexes={indexes}
          measurements={windowing.measurements}
          visible={visible}
          measure={windowing.virtualizer.measureElement}
          countLabel={props.countLabel}
          onOpenBurst={props.onOpenBurst}
          onOpenItem={props.onOpenItem}
          onCollapseBurst={onCollapseBurst}
        />
      </div>
    </section>
  );
}
