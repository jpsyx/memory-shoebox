import { Popover } from "@mantine/core";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { ReactionActionLabel } from "@/system/Reactions/ReactionActionLabel";
import { ReactionChoices } from "@/system/Reactions/ReactionChoices";
import classes from "@/system/system.module.css";

type Props = {
  /** The reaction the row shows as yours, or null for none. */
  chosen: ReactionKind | null;
  onPanel: boolean;
  /** Null takes your own reaction off. */
  onChoose: (kind: ReactionKind | null) => void;
};

/** The action's look: on the panel or in a print, and whether it is yours. */
function _actionClassName(
  options: Readonly<{ chosen: ReactionKind | null; onPanel: boolean }>,
): string {
  const { chosen, onPanel } = options;
  return clsx(
    classes.reactionButton,
    onPanel && classes.reactionOnPanel,
    chosen !== null &&
      (onPanel ? classes.reactionOnPanelMine : classes.reactionButtonMine),
  );
}

/**
 * The React action and the six choices it opens. Pressing the one you have
 * already left takes it off again. Focus stays in the picker while it is open
 * and goes back to the action when it closes.
 */
export function ReactionPicker({
  chosen,
  onPanel,
  onChoose,
}: Readonly<Props>): ReactNode {
  const [isPicking, setIsPicking] = useState(false);
  return (
    <Popover
      opened={isPicking}
      onChange={setIsPicking}
      position="top-start"
      withinPortal
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <button
          type="button"
          className={_actionClassName({ chosen, onPanel })}
          aria-expanded={isPicking}
          onClick={() => {
            setIsPicking(!isPicking);
          }}
        >
          <ReactionActionLabel chosen={chosen} />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <ReactionChoices
          chosen={chosen}
          onChoose={(kind) => {
            setIsPicking(false);
            onChoose(kind);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
