import type { ReactionSummary } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { makeSummaryFromChoice } from "@/system/Reactions/makeSummaryFromChoice/makeSummaryFromChoice";

const SUMMARY: ReactionSummary = {
  kinds: [
    {
      kind: "love",
      count: 2,
      members: [
        { memberId: "a", displayName: "Abuela Rosa" },
        { memberId: "b", displayName: "Mamá" },
      ],
    },
    {
      kind: "like",
      count: 1,
      members: [{ memberId: "c", displayName: "Tía" }],
    },
  ],
  myKind: null,
};

const VIEWER = { memberId: "me", displayName: "Papá" };

describe("makeSummaryFromChoice", () => {
  it("adds my reaction as a kind of its own when nobody had left it", () => {
    expect(
      makeSummaryFromChoice({
        reactions: SUMMARY,
        chosen: "wow",
        viewer: VIEWER,
      }),
    ).toEqual({
      kinds: [...SUMMARY.kinds, { kind: "wow", count: 1, members: [VIEWER] }],
      myKind: "wow",
    });
  });

  it("orders by count, then by the canonical order of the kinds", () => {
    expect(
      makeSummaryFromChoice({
        reactions: SUMMARY,
        chosen: "like",
        viewer: VIEWER,
      }).kinds.map((entry) => {
        return [entry.kind, entry.count];
      }),
    ).toEqual([
      ["like", 2],
      ["love", 2],
    ]);
  });

  it("moves my name and both counts when I change my mind", () => {
    const mine: ReactionSummary = {
      kinds: [
        {
          kind: "love",
          count: 2,
          members: [{ memberId: "a", displayName: "Abuela Rosa" }, VIEWER],
        },
        {
          kind: "like",
          count: 1,
          members: [{ memberId: "c", displayName: "Tía" }],
        },
      ],
      myKind: "love",
    };

    expect(
      makeSummaryFromChoice({
        reactions: mine,
        chosen: "like",
        viewer: VIEWER,
      }),
    ).toEqual({
      kinds: [
        {
          kind: "like",
          count: 2,
          members: [{ memberId: "c", displayName: "Tía" }, VIEWER],
        },
        {
          kind: "love",
          count: 1,
          members: [{ memberId: "a", displayName: "Abuela Rosa" }],
        },
      ],
      myKind: "like",
    });
  });

  it("drops a kind that taking mine off leaves at nought", () => {
    const mine: ReactionSummary = {
      kinds: [{ kind: "sad", count: 1, members: [VIEWER] }],
      myKind: "sad",
    };
    expect(
      makeSummaryFromChoice({ reactions: mine, chosen: null, viewer: VIEWER }),
    ).toEqual({ kinds: [], myKind: null });
  });
});
