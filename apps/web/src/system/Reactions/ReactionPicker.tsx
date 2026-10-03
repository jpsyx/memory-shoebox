import { Popover } from "@mantine/core";
import { IconThumbUp } from "@tabler/icons-react";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { ICON_PROPS_SMALL } from "@/system/icons";
import {
  REACTIONS,
  getReactionEntryFromKind,
} from "@/system/Reactions/reactionEntries";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** The reaction the row shows as yours, or null for none. */
  chosen: ReactionKind | null;
  onPanel: boolean;
  /** Null takes your own reaction off. */
  onChoose: (kind: ReactionKind | null) => void;
};

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
  const chosenReaction =
    chosen === null ? undefined : getReactionEntryFromKind(chosen);
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
          className={clsx(
            classes.reactionButton,
            onPanel && classes.reactionOnPanel,
            chosen !== null &&
              (onPanel
                ? classes.reactionOnPanelMine
                : classes.reactionButtonMine),
          )}
          aria-expanded={isPicking}
          onClick={() => {
            return setIsPicking((open) => {
              return !open;
            });
          }}
        >
          {chosenReaction === undefined ? (
            <>
              <IconThumbUp {...ICON_PROPS_SMALL} />
              React
            </>
          ) : (
            <>
              <chosenReaction.icon {...ICON_PROPS_SMALL} />
              {chosenReaction.word}
            </>
          )}
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <div className={classes.reactionPicker}>
          {REACTIONS.map((reaction) => {
            return (
              <button
                key={reaction.kind}
                type="button"
                className={clsx(
                  classes.reactionChoice,
                  chosen === reaction.kind && classes.reactionChoiceMine,
                )}
                aria-pressed={chosen === reaction.kind}
                onClick={() => {
                  setIsPicking(false);
                  onChoose(chosen === reaction.kind ? null : reaction.kind);
                }}
              >
                <reaction.icon {...ICON_PROPS_SMALL} />
                {reaction.word}
              </button>
            );
          })}
        </div>
        <Prose className={classes.reactionPicker}>
          Pressing the one you have already left takes it off again.
        </Prose>
      </Popover.Dropdown>
    </Popover>
  );
}
