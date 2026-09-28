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
});
