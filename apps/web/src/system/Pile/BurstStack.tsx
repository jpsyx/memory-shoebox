import { Button } from "@mantine/core";
import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemSummary } from "@memory-shoebox/shared";
import { Print } from "@/system/Pile/Print";
import classes from "@/system/system.module.css";

type Props = {
  cover: ItemSummary;
  /** Absent until the burst has been opened and its frames fetched. */
  frames?: readonly ItemSummary[];
  /** How many frames this viewer can see. Never a stored count. */
  frameCount: number;
  span: string;
  seed: number;
  /** Called when the collapsed stack is pressed. A later step fetches them. */
  onOpen?: () => void;
  startOpen?: boolean;
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
  startOpen = false,
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
                media={frame.media}
                seed={seed + index + 1}
              />
            );
          })}
        </div>
      ) : (
        <>
          <Print
            media={cover.media}
            seed={seed}
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
