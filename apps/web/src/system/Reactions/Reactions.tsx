import { useState, type ReactNode } from "react";
import type {
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import { makePresentReactionsFromSummary } from "@/system/Reactions/presentReactions";
import { ReactionPicker } from "@/system/Reactions/ReactionPicker";
import { ReactionCount } from "@/system/Reactions/ReactionCount";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  reactions: ReactionSummary;
  /**
   * Who is looking. Required, because the row answers a tap before the server
   * has heard about it, and a row that moves your count without moving your
   * name leaves you listed under the reaction you just left.
   */
  viewer: MemberRef;
  /** A line under the row saying where a reaction goes, on the media only. */
  goesTo?: string;
  /** Set where the row sits on the enamel rather than inside a print. */
  onPanel?: boolean;
  /**
   * Null takes your own reaction off. The mutation that sends the change to
   * the server is wired in separately.
   */
  onReact?: (kind: ReactionKind | null) => void;
};

/**
 * Reactions on a photograph, a video or a comment.
 *
 * The same component in both places, because they are the same act. For most
 * of the people in a family archive a reaction is the whole of what they will
 * ever leave: it is one tap, and writing a sentence is not, and a grandmother
 * who taps a heart on every photograph of her grandson has said plenty.
 */
export function Reactions({
  reactions,
  viewer,
  goesTo,
  onPanel = false,
  onReact,
}: Readonly<Props>): ReactNode {
  const [chosen, setChosen] = useState<ReactionKind | null>(reactions.myKind);
  // The summary it is given wins over the tap whenever it is a new object,
  // which is also how a failed reaction is put back: the cache rolls back to
  // a new summary and the row follows. It follows the object rather than
  // `myKind`, because a tap and its rollback can both land before a render,
  // leaving `myKind` as it was while the local choice is stale. An unchanged
  // summary keeps its reference, so nothing resets without cause. Adjusted
  // during render rather than in an effect, which is React's own pattern for
  // state that tracks a prop.
  const [answered, setAnswered] = useState(reactions);
  if (reactions !== answered) {
    setAnswered(reactions);
    setChosen(reactions.myKind);
  }
  const present = makePresentReactionsFromSummary({
    reactions,
    chosen,
    viewer,
  });

  return (
    <div>
      <div className={classes.reactionRow}>
        <ReactionPicker
          chosen={chosen}
          onPanel={onPanel}
          onChoose={(kind) => {
            setChosen(kind);
            onReact?.(kind);
          }}
        />
        <ReactionCount present={present} />
      </div>
      {goesTo === undefined ? null : <Prose onPanel={onPanel}>{goesTo}</Prose>}
    </div>
  );
}
