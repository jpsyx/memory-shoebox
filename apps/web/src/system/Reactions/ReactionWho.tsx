import type { ReactNode } from "react";
import { ICON_PROPS_SMALL } from "@/system/icons";
import type { PresentReactions } from "@/system/Reactions/presentReactions";
import { getReactionEntryFromKind } from "@/system/Reactions/reactionEntries";
import classes from "@/system/system.module.css";

type Props = {
  entries: PresentReactions["entries"];
};

/** Who left which reaction, one row per kind. */
export function ReactionWho({ entries }: Readonly<Props>): ReactNode {
  return (
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
  );
}
