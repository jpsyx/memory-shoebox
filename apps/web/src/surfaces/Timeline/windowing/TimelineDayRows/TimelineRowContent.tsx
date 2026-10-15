import { Button } from "@mantine/core";

import { useContext, type ReactNode } from "react";

import { PileItems } from "@/system/Pile/PileItems/PileItems";

import { BurstPhoto } from "@/system/Pile/BurstStack/BurstPhoto";

import { PileBurstActionsContext } from "@/system/Pile/PileBurstActions";

import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";

import classes from "@/system/system.module.css";
import type { Props } from "./TimelineDayRows.types";
import { TimelineHeader } from "./TimelineHeader";
/** Renders the owned TimelineRowContent portion of the timeline. */
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
  if (row.isFanHeader) {
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
  }
  if (row.frames) {
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
  }
  if (row.kind === "header") {
    return (
      <TimelineHeader row={row} countLabel={countLabel} isMobile={isMobile} />
    );
  }
  return (
    <PileItems
      items={row.items}
      seedBase={row.seedBase}
      onOpenBurst={onOpenBurst}
      onOpenItem={onOpenItem}
    />
  );
}
