import { REACTION_ORDER } from "@memory-shoebox/shared";
import type {
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import { makePresentReactionsFromSummary } from "@/system/Reactions/presentReactions";

/**
 * The whole summary once a local choice is applied, in the shape and the
 * order the server answers with.
 *
 * What the item's cache holds between a tap and the server's answer
 * (`surfaces/Item/itemWrites/`), so the row reads the same
 * before and after the round trip and a failure can be rolled back to the
 * summary it replaced. The server orders kinds by count, largest first, then
 * by `REACTION_ORDER`, so the kinds are sorted that way here: a new kind
 * would otherwise sit at the end until the answer moved it.
 */
export function makeSummaryFromChoice(
  options: Readonly<{
    reactions: ReactionSummary;
    chosen: ReactionKind | null;
    viewer: MemberRef;
  }>,
): ReactionSummary {
  return {
    kinds: [...makePresentReactionsFromSummary(options).entries].sort(
      (left, right) => {
        return (
          right.count - left.count ||
          REACTION_ORDER.indexOf(left.kind) - REACTION_ORDER.indexOf(right.kind)
        );
      },
    ),
    myKind: options.chosen,
  };
}
