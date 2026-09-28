import { describe, expect, it } from "vitest";
import { createVisibleRuleIdsCache } from "../../src/visibility/createVisibleRuleIdsCache.ts";

describe("createVisibleRuleIdsCache", () => {
  it("returns what was stored for the same member and generation", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "rosa", generation: 4 })).toEqual(["rule-1"]);
  });

  it("misses for a member it has never seen", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "ines", generation: 4 })).toBeUndefined();
  });

  it("misses once the generation moves", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    expect(cache.get({ memberId: "rosa", generation: 5 })).toBeUndefined();
  });

  it("drops every other member's entry on the same bump", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    cache.set({ memberId: "ines", generation: 4, ruleIds: ["rule-2"] });

    // One member's expansion is recomputed under the new generation. Every
    // other member's must be gone, or a group edit invalidates only the
    // viewer who happened to make the next request.
    cache.set({ memberId: "rosa", generation: 5, ruleIds: ["rule-1"] });

    expect(cache.get({ memberId: "ines", generation: 5 })).toBeUndefined();
    expect(cache.get({ memberId: "ines", generation: 4 })).toBeUndefined();
  });

  it("hands out an array a caller cannot corrupt", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    const cached = cache.get({ memberId: "rosa", generation: 4 });
    expect(() => {
      return (cached as string[]).push("rule-2");
    }).toThrow();
  });

  it("hands the frozen array back from the store itself", () => {
    const cache = createVisibleRuleIdsCache();
    const ruleIds = ["rule-1"];
    const stored = cache.set({ memberId: "rosa", generation: 4, ruleIds });

    // A store is enough to hold the shared copy: the caller never has to read
    // it back, which is a read a concurrent store under another generation
    // could make miss, leaving them with the mutable array they passed in.
    expect(stored).not.toBe(ruleIds);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(stored).toEqual(["rule-1"]);
    expect(cache.get({ memberId: "rosa", generation: 4 })).toBe(stored);
  });

  it("hands back the array belonging to the generation it stored under", () => {
    const cache = createVisibleRuleIdsCache();
    cache.set({ memberId: "rosa", generation: 4, ruleIds: ["rule-1"] });
    const stored = cache.set({
      memberId: "ines",
      generation: 5,
      ruleIds: ["rule-2"],
    });

    // The bump cleared rosa's entry, and ines still holds hers.
    expect(cache.get({ memberId: "rosa", generation: 5 })).toBeUndefined();
    expect(stored).toEqual(["rule-2"]);
  });
});
