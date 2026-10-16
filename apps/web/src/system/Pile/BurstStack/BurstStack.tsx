import { useBurstMotion } from "@/system/motion/useBurstMotion";
import { PileSelectionContext } from "../PileSelection/PileSelection";
import { clsx } from "clsx";
import { useContext, useEffect, useState, type ReactNode } from "react";
import type { BurstFrameRef, ItemSummary } from "@memory-shoebox/shared";
import classes from "./BurstStack.module.css";
import { BurstCover } from "./BurstCover/BurstCover";
import { BurstFan } from "./BurstFan/BurstFan";

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

/**
 * A stack opens browsing frames normally and only filtered frames during
 * selection.
 */
export function BurstStack({
  cover,
  frames,
  frameCount,
  span,
  seed,
  onOpen,
  onOpenFrame,
  onRemoveFrame,
  startOpen,
  burstId,
  hasUnseenFrames,
}: Readonly<Props>): ReactNode {
  const props: Props = {
    cover,
    frames,
    frameCount,
    span,
    seed,
    onOpen,
    onOpenFrame,
    onRemoveFrame,
    startOpen,
    burstId,
    hasUnseenFrames,
  };
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
      className={clsx(
        classes.burstStack,
        controls.isFanned && classes.burstStackOpen,
      )}
      data-burst-stack
      data-burst-id={props.burstId}
      ref={motion.reference}
      onClickCapture={motion.capture}
      onKeyDown={(event) => {
        if (event.key === "Escape" && controls.isFanned) {
          animatedControls.onCollapse();
        }
      }}
    >
      {controls.isFanned ? (
        <BurstFan
          frames={controls.shownFrames ?? []}
          span={props.span}
          seed={props.seed}
          isPinned={controls.isPinned}
          onCollapse={animatedControls.onCollapse}
          onOpenFrame={props.onOpenFrame}
          onRemoveFrame={controls.isSelecting ? undefined : props.onRemoveFrame}
        />
      ) : (
        <BurstCover
          cover={props.cover}
          seed={props.seed}
          frameCount={props.frameCount}
          hasUnseenFrames={props.hasUnseenFrames}
          onOpen={controls.onOpen}
        />
      )}
    </div>
  );
}
