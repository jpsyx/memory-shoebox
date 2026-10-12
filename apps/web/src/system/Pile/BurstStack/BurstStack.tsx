import { useBurstMotion } from "@/system/motion/useBurstMotion";
import { PileSelectionContext } from "../PileSelection/PileSelection";
import { Button } from "@mantine/core";
import { clsx } from "clsx";
import { useContext, useEffect, useState, type ReactNode } from "react";
import type { BurstFrameRef, ItemSummary } from "@memory-shoebox/shared";
import { BurstPhoto } from "./BurstPhoto";
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
  /** Offered only to photos carrying explicit management permission. */
  onRemoveFrame?: (itemId: string) => void;
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

type StackControls = {
  isFanned: boolean;
  isPinned: boolean;
  isSelecting: boolean;
  shownFrames: readonly BurstFrameRef[] | undefined;
  onOpen: () => void;
  onCollapse: () => void;
};

function useStackControls(props: Readonly<Props>): StackControls {
  const [isOpen, setIsOpen] = useState(props.startOpen ?? false);
  const selection = useContext(PileSelectionContext);
  const selectedFrames =
    props.burstId === undefined
      ? undefined
      : selection?.framesByBurstId.get(props.burstId);
  const shownFrames = selection === undefined ? props.frames : selectedFrames;
  useEffect(() => {
    setIsOpen(props.startOpen ?? false);
  }, [props.startOpen]);
  return {
    shownFrames,
    isSelecting: selection !== undefined,
    isPinned: selectedFrames !== undefined,
    isFanned:
      (isOpen || selectedFrames !== undefined) && shownFrames !== undefined,
    onCollapse: () => {
      setIsOpen(false);
    },
    onOpen: () => {
      if (selection !== undefined) {
        if (!selection.isBusy && props.burstId !== undefined) {
          selection.onOpenBurst(props.burstId);
        }
        return;
      }
      setIsOpen(true);
      props.onOpen?.();
    },
  };
}

function _renderFan(
  props: Readonly<Props>,
  controls: Readonly<StackControls>,
): ReactNode {
  return (
    <div className={classes.fan}>
      <div className={classes.fanHead}>
        <b className={classes.fanHeadLabel}>{props.span}</b>
        <Button
          disabled={controls.isPinned}
          variant="panel"
          size="sm"
          onClick={controls.onCollapse}
        >
          Collapse
        </Button>
      </div>
      {(controls.shownFrames ?? []).map((frame, index) => {
        return (
          <BurstPhoto
            key={frame.itemId}
            frame={frame}
            seed={props.seed + index + 1}
            onOpen={props.onOpenFrame}
            onRemove={controls.isSelecting ? undefined : props.onRemoveFrame}
          />
        );
      })}
    </div>
  );
}

function _renderCover(props: Readonly<Props>, onOpen: () => void): ReactNode {
  return (
    <Print
      media={props.cover.media}
      seed={props.seed}
      itemId={undefined}
      unseen={props.hasUnseenFrames}
      onClick={onOpen}
    >
      <span className={classes.stackCount}>
        {props.frameCount} <small>photos</small>
      </span>
    </Print>
  );
}

/** A stack opens browsing frames normally and only filtered frames during selection. */
export function BurstStack(props: Readonly<Props>): ReactNode {
  const controls = useStackControls(props);
  const motion = useBurstMotion(controls.isFanned);
  const animatedControls = {
    ...controls,
    onCollapse: () => {
      if (!controls.isPinned) {
        motion.collapse(controls.onCollapse);
      }
    },
  };
  return (
    <div
      className={clsx(classes.stack, controls.isFanned && classes.stackOpen)}
      data-burst-id={props.burstId}
      ref={motion.reference}
      onClickCapture={motion.capture}
      onKeyDown={(event) => {
        if (event.key === "Escape" && controls.isFanned) {
          animatedControls.onCollapse();
        }
      }}
    >
      {controls.isFanned
        ? _renderFan(props, animatedControls)
        : _renderCover(props, controls.onOpen)}
    </div>
  );
}
