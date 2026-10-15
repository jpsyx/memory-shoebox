import { type ReactNode } from "react";

import type { StreamProps } from "./DayStream.types";
import { StreamDay } from "./StreamDay";
/** Renders the owned StreamDays portion of the timeline. */
export function StreamDays({
  props,
  stream,
  onCollapseBurst,
}: StreamProps): ReactNode {
  const days = new Map(
    stream.rows.map((row) => {
      return [row.day.capturedOn, row.day];
    }),
  );
  const visible = new Set(
    stream.windowing.positions.map((position) => {
      return position.index;
    }),
  );
  return [...days.values()].map((day) => {
    return (
      <StreamDay
        key={day.capturedOn}
        day={day}
        visible={visible}
        props={props}
        stream={stream}
        onCollapseBurst={onCollapseBurst}
      />
    );
  });
}
