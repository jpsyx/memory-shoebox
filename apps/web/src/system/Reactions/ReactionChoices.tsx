import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { ICON_PROPS_SMALL } from "@/system/icons";
import { REACTIONS } from "@/system/Reactions/reactionEntries";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  /** The reaction the row shows as yours, or null for none. */
  chosen: ReactionKind | null;
  /** Null takes your own reaction off. */
  onChoose: (kind: ReactionKind | null) => void;
};

/**
 * The six choices, each carrying its word. Pressing the one you have already
 * left chooses none, which takes it off again.
 */
export function ReactionChoices({
  chosen,
  onChoose,
}: Readonly<Props>): ReactNode {
  return (
    <>
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
    </>
  );
}
