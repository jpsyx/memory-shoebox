import { Button } from "@mantine/core";
import { useContext, type ReactNode } from "react";
import { DaySpine } from "@/system/Pile/DaySpine";
import { MilestoneBand } from "@/system/Pile/MilestoneBand";
import { MilestoneContinues } from "@/system/Pile/MilestoneContinues";
import { PileItems } from "@/system/Pile/PileItems/PileItems";
import { BurstPhoto } from "@/system/Pile/BurstStack/BurstPhoto";
import { PileBurstActionsContext } from "@/system/Pile/PileBurstActions";
import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";
import { MilestoneEmptyPile } from "../DayBlock/MilestoneEmptyPile";
import type { TimelineRenderRow } from "./timelineWindow.types";
import classes from "@/system/system.module.css";

type Props = {
  row: TimelineRenderRow;
  countLabel?: string;
  isMobile?: boolean;
  onOpenBurst: (burstId: string) => void;
  onCollapseBurst?: (burstId: string) => void;
  onOpenItem: (itemId: string) => void;
};

/** Server-ranked occasions keep their order in the day's measurable header. */
function TimelineHeader({
  row,
  countLabel,
  isMobile,
}: Pick<Props, "row" | "countLabel" | "isMobile">): ReactNode {
  return (
    <>
      {isMobile && (
        <div className={classes.timelineMobileSpine}>
          <DaySpine day={row.day} countLabel={countLabel} />
        </div>
      )}
      {row.day.milestoneBand && <MilestoneBand band={row.day.milestoneBand} />}
      {row.day.milestoneStrips.map((strip) => {
        return (
          <MilestoneContinues key={strip.milestone.milestoneId} strip={strip} />
        );
      })}
      {row.day.items.length === 0 && <MilestoneEmptyPile />}
    </>
  );
}

/** Bounded fan lines retain intrinsic photo widths and original scatter seeds. */
export function TimelineRowContent({
  row,
  countLabel,
  isMobile,
  onOpenBurst,
  onCollapseBurst,
  onOpenItem,
}: Readonly<Props>): ReactNode {
  const selection = useContext(PileSelectionContext);
  const onRemove = useContext(PileBurstActionsContext);
  if (row.isFanHeader)
    return (
      <div className={classes.fanHead}>
        <b className={classes.fanHeadLabel}>
          {row.items[0]?.burst?.visibleFrameCount} photos
        </b>
        <Button
          disabled={selection?.framesByBurstId.has(row.burstId!)}
          variant="panel"
          size="sm"
          onClick={() => {
            return onCollapseBurst?.(row.burstId!);
          }}
        >
          Collapse
        </Button>
      </div>
    );
  if (row.frames)
    return row.frames.map((frame, index) => {
      return (
        <BurstPhoto
          key={frame.itemId}
          frame={frame}
          seed={row.seedBase + row.frameOffset! + index + 1}
          onOpen={onOpenItem}
          onRemove={selection ? undefined : onRemove}
        />
      );
    });
  if (row.kind === "header")
    return (
      <TimelineHeader row={row} countLabel={countLabel} isMobile={isMobile} />
    );
  return (
    <PileItems
      items={row.items}
      seedBase={row.seedBase}
      onOpenBurst={onOpenBurst}
      onOpenItem={onOpenItem}
    />
  );
}

/** A single measurement wrapper owns grid or fan-line sizing. */
function MeasuredRow(
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
        )
          props.onCollapseBurst?.(row.burstId);
      }}
    >
      <TimelineRowContent {...props} />
    </div>
  );
}

type WindowRowsProps = Omit<Props, "row"> & {
  rows: readonly TimelineRenderRow[];
  indexes: readonly number[];
  measurements: ReadonlyArray<import("@tanstack/react-virtual").VirtualItem>;
  visible: ReadonlySet<number>;
  measure: (element: HTMLElement | null) => void;
};

/** Each full-width fan keeps its sticky header across independently windowed lines. */
export function TimelineDayRows(props: Readonly<WindowRowsProps>): ReactNode {
  const firstStart = props.measurements[props.indexes[0] ?? 0]?.start ?? 0;
  const groups = _getRowGroups(props);
  return groups.map((indexes) => {
    const first = props.rows[indexes[0]!]!;
    const positions = indexes.filter((index) => {
      return props.visible.has(index);
    });
    if (positions.length === 0) return null;
    if (!first.burstId)
      return (
        <MeasuredRow
          key={first.key}
          {...props}
          row={first}
          index={indexes[0]!}
          top={props.measurements[indexes[0]!]!.start - firstStart}
        />
      );
    const start = props.measurements[indexes[0]!]!.start;
    const end = props.measurements[indexes.at(-1)!]!.end;
    if (first.isFanHeader && !positions.includes(indexes[0]!))
      positions.unshift(indexes[0]!);
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
    )
      previous.push(index);
    else groups.push([index]);
  });
  return groups;
}
