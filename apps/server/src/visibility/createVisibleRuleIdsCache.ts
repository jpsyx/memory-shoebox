/** A member's expansion, kept only while the generation it was built under
 * is still current. */
export type VisibleRuleIdsCache = {
  /** The expansion for this member under this generation, or undefined. */
  get: (options: {
    memberId: string;
    generation: number;
  }) => readonly string[] | undefined;
  /**
   * Stores one expansion, dropping everything older when the key moves.
   *
   * Returns the frozen array it stored. A caller that read it back with `get`
   * instead could miss, because a concurrent store under another generation
   * clears the map, and would then hold the mutable array it passed in.
   */
  set: (options: {
    memberId: string;
    generation: number;
    ruleIds: readonly string[];
  }) => readonly string[];
};

/**
 * The `(memberId, visibilityGeneration)` cache `conventions.md` § The auth
 * middleware requires.
 *
 * **A generation that has moved clears the whole map** rather than evicting
 * one key. The map holds one entry per member of a nine-person family, and the
 * failure it must not have is a stale entry surviving its generation: that is
 * exactly "a group edit invalidates every viewer's cache at once and nobody
 * keeps stale access".
 *
 * Process-local, which is enough only because the deployment is a single Fly
 * machine (`docs/architecture.md`). A second machine would make this wrong
 * rather than slow.
 *
 * The stored array is frozen because it is shared with every request holding
 * the same key: a caller that sorted or pushed to it would corrupt the others.
 */
export function createVisibleRuleIdsCache(): VisibleRuleIdsCache {
  const byMemberId = new Map<string, readonly string[]>();
  let cachedGeneration: number | undefined;

  return {
    get: (options) => {
      if (options.generation !== cachedGeneration) {
        return undefined;
      }
      return byMemberId.get(options.memberId);
    },

    set: (options) => {
      if (options.generation !== cachedGeneration) {
        cachedGeneration = options.generation;
        byMemberId.clear();
      }
      const stored = Object.freeze([...options.ruleIds]);
      byMemberId.set(options.memberId, stored);
      return stored;
    },
  };
}
