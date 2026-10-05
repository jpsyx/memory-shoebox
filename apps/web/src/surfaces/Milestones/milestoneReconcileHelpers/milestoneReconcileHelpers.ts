import {
  reconcileMilestoneRequestSchema,
  type MilestoneRef,
  type ReconcileMilestoneRequest,
} from "@memory-shoebox/shared";
/** Produces an explicit move batch only when every named date is valid. */
export function getMilestoneMovesFromTargets(
  options: Readonly<{
    milestone: MilestoneRef;
    itemIds: readonly string[];
    targets: Readonly<Record<string, string | undefined>>;
  }>,
): ReconcileMilestoneRequest | undefined {
  const { milestone, itemIds, targets } = options;
  if (
    itemIds.length === 0 ||
    itemIds.length > 500 ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return undefined;
  }
  const moves = itemIds.map((itemId) => {
    return {
      itemId,
      targetOn: targets[itemId],
    };
  });
  if (
    moves.some(({ targetOn }) => {
      return (
        targetOn === undefined ||
        targetOn < milestone.startsOn ||
        targetOn > milestone.endsOn
      );
    })
  ) {
    return undefined;
  }
  const parsed = reconcileMilestoneRequestSchema.safeParse({
    mode: "move",
    moves,
  });
  return parsed.success ? parsed.data : undefined;
}
/** Maps a server's dotted batch errors to the original submitted identities. */
export function getMilestoneFieldErrorsFromMoves(
  options: Readonly<{
    itemIds: readonly string[];
    fieldErrors: Readonly<Record<string, readonly string[]>>;
  }>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(options.fieldErrors).flatMap(([path, messages]) => {
      const match = /^moves\.(\d+)\.targetOn$/.exec(path);
      const itemId =
        match === null ? undefined : options.itemIds[Number(match[1])];
      return itemId === undefined ? [] : [[itemId, messages.join(" ")]];
    }),
  );
}
