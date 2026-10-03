import { Button } from "@mantine/core";
import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BurstFrameRef, ItemSummary } from "@memory-shoebox/shared";
import { Print } from "@/system/Pile/Print";
import classes from "@/system/system.module.css";

type Props = {
  cover: ItemSummary;
  /** Absent until the burst has been opened and its frames fetched. */
  frames?: readonly BurstFrameRef[];
  /** How many frames this viewer can see. Never a stored count. */
  frameCount: number;
  span: string;
  seed: number;
  /**
   * Called when the collapsed stack is pressed. Pressing it asks for the
   * frames, which arrive separately.
   */
  onOpen?: () => void;
  /** Called with a fanned frame's id when it is pressed: the viewer opens. */
  onOpenFrame?: (itemId: string) => void;
  startOpen?: boolean;
  /** The burst this stack stands for, written to the DOM for the latch. */
  burstId?: string;
  /**
   * Whether any visible frame behind this cover is still unseen.
   *
   * The stack draws one cover for frames the client holds no `isUnseen` for,
   * so without this the accent would drain: a day saying "31 new" would carry
   * no dot on the object holding twelve of them.
   */
  hasUnseenFrames?: boolean;
};

/**
 * The stack. The load-bearing idea: forty-five near-identical frames of one
 * moment are one object in the pile until somebody asks for them, so a birth
 * does not bury the rest of the day.
 */
export function BurstStack({
  cover,
  frames,
  frameCount,
  span,
  seed,
  onOpen,
  onOpenFrame,
  startOpen = false,
  burstId,
  hasUnseenFrames,
}: Readonly<Props>): ReactNode {
  const [isOpen, setIsOpen] = useState(startOpen);

  // An open fan with nothing in it is not a state this component has. The
  // frames arrive separately, from the burst's own route, so pressing the
  // stack asks for them and the fan opens when they land. Keeping the two
  // conditions together here is what stops a caller passing `startOpen` with
  // no frames and drawing a header over an empty run.
  const isFanned = isOpen && frames !== undefined;
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOpen(startOpen);
  }, [startOpen]);

  return (
    <div
      ref={stackRef}
      className={clsx(classes.stack, isFanned && classes.stackOpen)}
      data-burst-id={burstId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isFanned) {
          setIsOpen(false);
        }
      }}
    >
      {isFanned ? (
        <div className={classes.fan}>
          <div className={classes.fanHead}>
            <b className={classes.fanHeadLabel}>{span}</b>
            <Button
              variant="panel"
              size="sm"
              onClick={() => {
                return setIsOpen(false);
              }}
            >
              Collapse
            </Button>
          </div>
          {(frames ?? []).map((frame, index) => {
            return (
              <Print
                key={frame.itemId}
                media={frame}
                seed={seed + index + 1}
                onClick={() => {
                  return onOpenFrame?.(frame.itemId);
                }}
              />
            );
          })}
        </div>
      ) : (
        <>
          <Print
            media={cover.media}
            seed={seed}
            itemId={undefined}
            unseen={hasUnseenFrames}
            onClick={() => {
              setIsOpen(true);
              onOpen?.();
            }}
          />
          <span className={classes.stackCount}>
            {frameCount} <small>frames</small>
          </span>
        </>
      )}
    </div>
  );
}
