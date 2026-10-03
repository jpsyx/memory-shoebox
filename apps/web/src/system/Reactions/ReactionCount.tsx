import { Popover } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import type { PresentReactions } from "@/system/Reactions/presentReactions";
import { getReactionEntryFromKind } from "@/system/Reactions/reactionEntries";
import classes from "@/system/system.module.css";

type Props = {
  /** The entries with anybody left on them, and their total. */
  present: PresentReactions;
};

/**
 * How many reactions there are, and, once pressed, who left which. A screen
 * reader hears the count as reactions rather than as a bare number, and not
 * the marks beside it. Nothing at all while nobody has reacted.
 */
export function ReactionCount({ present }: Readonly<Props>): ReactNode {
  const [isShowingWho, setIsShowingWho] = useState(false);
  const { entries, total } = present;
  return total === 0 ? null : (
    <Popover
      opened={isShowingWho}
      onChange={setIsShowingWho}
      position="top-start"
      withinPortal
    >
      <Popover.Target>
        <button
          type="button"
          className={classes.reactionSummary}
          onClick={() => {
            return setIsShowingWho((open) => {
              return !open;
            });
          }}
        >
          <span className={classes.reactionSummaryIcons} aria-hidden="true">
            {entries.map((entry) => {
              const reaction = getReactionEntryFromKind(entry.kind);
              return <reaction.icon key={entry.kind} {...ICON_PROPS_SMALL} />;
            })}
          </span>
          {total}
          {/* Named by what it is rather than by a bare count. The space
              stands outside the hidden words, because a name is worked
              out from each element's own text trimmed. */}{" "}
          <span className="visually-hidden">
            {total === 1
              ? "reaction. See who left it"
              : "reactions. See who left them"}
          </span>
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <div className={classes.reactionWho}>
          {entries.map((entry) => {
            const reaction = getReactionEntryFromKind(entry.kind);
            return (
              <div key={entry.kind} className={classes.reactionWhoRow}>
                <span className={classes.reactionWhoKind}>
                  <reaction.icon {...ICON_PROPS_SMALL} />
                  {reaction.word}
                </span>
                <span>
                  {entry.members
                    .map((member) => {
                      return member.displayName;
                    })
                    .join(", ")}
                </span>
              </div>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
