import type {
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";

/**
 * What the reaction row draws: the entries with anybody left on them, and
 * their total.
 */
export type PresentReactions = {
  readonly entries: ReadonlyArray<ReactionSummary["kinds"][number]>;
  readonly total: number;
};

/**
 * The server's reaction summary, adjusted for a choice made locally that has
 * not been to the server yet.
 *
 * The row has to answer a tap before any server round trip, so this moves
 * your own count and your own name together to wherever your local choice
 * now says they belong: moving only the count would leave you listed under
 * the reaction you just moved away from, which reads as a bug rather than as
 * latency.
 */
export function makePresentReactionsFromSummary(options: {
  readonly reactions: ReactionSummary;
  readonly chosen: ReactionKind | null;
  readonly viewer: MemberRef;
}): PresentReactions {
  const { reactions, chosen, viewer } = options;

  const adjusted = reactions.kinds.map((entry) => {
    const wasMine = reactions.myKind === entry.kind;
    const isMine = chosen === entry.kind;
    if (wasMine === isMine) {
      return entry;
    }
    return {
      ...entry,
      count: entry.count + (isMine ? 1 : -1),
      members: isMine
        ? [...entry.members, viewer]
        : entry.members.filter((member) => {
            return member.memberId !== viewer.memberId;
          }),
    };
  });

  const isChosenAlreadyAdjusted = adjusted.some((entry) => {
    return entry.kind === chosen;
  });
  const ownEntry =
    chosen === null || isChosenAlreadyAdjusted
      ? undefined
      : { kind: chosen, count: 1, members: [viewer] };

  const entries = [...adjusted, ownEntry]
    .filter((entry) => {
      return entry !== undefined;
    })
    .filter((entry) => {
      return entry.count > 0;
    });

  const total = entries.reduce((sum, entry) => {
    return sum + entry.count;
  }, 0);

  return { entries, total };
}

/**
 * The whole summary once a local choice is applied, in the shape the server
 * answers with.
 *
 * What the item's cache holds between a tap and the server's answer
 * (`surfaces/Item/itemWrites/useConversation.ts`), so the row reads the same
 * before and after the round trip and a failure can be rolled back to the
 * summary it replaced.
 */
export function makeSummaryFromChoice(
  options: Readonly<{
    reactions: ReactionSummary;
    chosen: ReactionKind | null;
    viewer: MemberRef;
  }>,
): ReactionSummary {
  return {
    kinds: [...makePresentReactionsFromSummary(options).entries],
    myKind: options.chosen,
  };
}
