import { type ReactNode } from "react";

import classes from "./TimelineDayRows.module.css";
import { MeasuredRow } from "./MeasuredRow/MeasuredRow";
import type { WindowRowsProps as Props } from "./TimelineDayRows.types";

function _getRowGroups(
  props: Readonly<Pick<Props, "rows" | "indexes">>,
): number[][] {
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

/**
 * Each full-width fan keeps its sticky header across independently windowed
 * lines.
 */
export function TimelineDayRows({
  rows,
  indexes,
  measurements,
  visible,
  measure,
  countLabel,
  isMobile,
  onOpenBurst,
  onCollapseBurst,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  const rowProps = {
    measure,
    countLabel,
    isMobile,
    onOpenBurst,
    onCollapseBurst,
    onOpenItem,
  };
  const firstStart = measurements[indexes[0] ?? 0]?.start ?? 0;
  const groups = _getRowGroups({ rows, indexes });
  return groups.map((groupIndexes) => {
    const first = rows[groupIndexes[0]!]!;
    const positions = groupIndexes.filter((index) => {
      return visible.has(index);
    });
    if (positions.length === 0) {
      return null;
    }
    if (!first.burstId) {
      return (
        <MeasuredRow
          key={first.key}
          {...rowProps}
          row={first}
          index={groupIndexes[0]!}
          top={measurements[groupIndexes[0]!]!.start - firstStart}
        />
      );
    }
    const start = measurements[groupIndexes[0]!]!.start;
    const end = measurements[groupIndexes.at(-1)!]!.end;
    if (first.isFanHeader && !positions.includes(groupIndexes[0]!)) {
      positions.unshift(groupIndexes[0]!);
    }
    return (
      <div
        key={first.burstId}
        className={classes.timelineDayRowsFanGroup}
        style={{ top: start - firstStart, height: end - start }}
      >
        {positions.map((index) => {
          return (
            <MeasuredRow
              key={rows[index]!.key}
              {...rowProps}
              row={rows[index]!}
              index={index}
              top={measurements[index]!.start - start}
            />
          );
        })}
      </div>
    );
  });
}
