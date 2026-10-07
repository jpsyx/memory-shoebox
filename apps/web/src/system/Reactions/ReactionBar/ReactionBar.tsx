import type { ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { getReactionEntryFromKind } from "../reactionEntries";
import classes from "./ReactionBar.module.css";

type Props = {
  chosen: ReactionKind | null;
  onChoose: (kind: ReactionKind | null) => void;
};

/** Emoji labels for the existing six comment-reaction kinds. Love leads. */
export const REACTION_EMOJIS: Record<ReactionKind, string> = {
  love: "❤️",
  like: "👍",
  care: "🥰",
  haha: "😂",
  wow: "😮",
  sad: "😢",
};

/** The reaction bar keeps its choices named for touch and assistive technology. */
export function ReactionBar({ chosen, onChoose }: Readonly<Props>): ReactNode {
  return (
    <div className={classes.reactionBar} role="group" aria-label="Reaction bar">
      {(Object.keys(REACTION_EMOJIS) as ReactionKind[]).map((kind) => {
        const { word } = getReactionEntryFromKind(kind);
        return (
          <button
            key={kind}
            type="button"
            className={classes.reactionBarChoice}
            data-autofocus={kind === "love" || undefined}
            aria-label={word}
            aria-pressed={chosen === kind}
            title={word}
            onClick={() => {
              onChoose(chosen === kind ? null : kind);
            }}
          >
            <span aria-hidden="true">{REACTION_EMOJIS[kind]}</span>
          </button>
        );
      })}
    </div>
  );
}
