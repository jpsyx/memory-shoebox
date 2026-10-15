import { type ReactNode } from "react";

import classes from "@/system/system.module.css";
import { MeasuredRow } from "./MeasuredRow";
import type { WindowRowsProps } from "./TimelineDayRows.types";

/** Each full-width fan keeps its sticky header across independently windowed lines. */
export function TimelineDayRows(props: Readonly<WindowRowsProps>): ReactNode {
  const firstStart = props.measurements[props.indexes[0] ?? 0]?.start ?? 0;
  const groups = _getRowGroups(props);
  return groups.map((indexes) => {
    const first = props.rows[indexes[0]!]!;
    const positions = indexes.filter((index) => {
      return props.visible.has(index);
    });
    if (positions.length === 0) {
      return null;
    }
    if (!first.burstId) {
      return (
        <MeasuredRow
          key={first.key}
          {...props}
          row={first}
          index={indexes[0]!}
          top={props.measurements[indexes[0]!]!.start - firstStart}
        />
      );
    }
    const start = props.measurements[indexes[0]!]!.start;
    const end = props.measurements[indexes.at(-1)!]!.end;
    if (first.isFanHeader && !positions.includes(indexes[0]!)) {
      positions.unshift(indexes[0]!);
    }
    return (
      <div
        key={first.burstId}
        className={classes.timelineFanGroup}
        style={{ top: start - firstStart, height: end - start }}
      >
        {positions.map((index) => {
          return (
            <MeasuredRow
              key={props.rows[index]!.key}
              {...props}
              row={props.rows[index]!}
              index={index}
              top={props.measurements[index]!.start - start}
            />
          );
        })}
      </div>
    );
  });
}

function _getRowGroups(props: Readonly<WindowRowsProps>): number[][] {
  const groups: number[][] = [];
  props.indexes.forEach((index) => {
    const row = props.rows[index]!;
    const previous = groups.at(-1);
    if (
      row.burstId &&
      previous &&
      props.rows[previous[0]!]!.burstId === row.burstId
    ) {
      previous.push(index);
    } else {
      groups.push([index]);
    }
  });
  return groups;
}
