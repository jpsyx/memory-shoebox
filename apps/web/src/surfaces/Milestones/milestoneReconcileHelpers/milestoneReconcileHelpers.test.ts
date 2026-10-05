import { describe, expect, it } from "vitest";
import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import { getMilestoneMovesFromTargets } from "./milestoneReconcileHelpers";
const firstId = "018f0000-0000-7000-8000-00000000f001";
const secondId = "018f0000-0000-7000-8000-00000000f002";
const milestone = {
  ...makeMilestoneDetailFromOverrides().milestone,
  startsOn: "2026-09-18",
  endsOn: "2026-09-20",
};
describe("explicit occasion move targets", () => {
  it("sends exactly the named dates", () => {
    expect(
      getMilestoneMovesFromTargets({
        milestone,
        itemIds: [firstId, secondId],
        targets: { [firstId]: "2026-09-18", [secondId]: "2026-09-20" },
      }),
    ).toEqual({
      mode: "move",
      moves: [
        { itemId: firstId, targetOn: "2026-09-18" },
        { itemId: secondId, targetOn: "2026-09-20" },
      ],
    });
  });
  it.each([undefined, "", "2026-09-17", "2026-09-21", "2026-09-19x"])(
    "refuses a missing or outside target %s",
    (target) => {
      expect(
        getMilestoneMovesFromTargets({
          milestone,
          itemIds: [firstId, secondId],
          targets: { [firstId]: "2026-09-18", [secondId]: target },
        }),
      ).toBeUndefined();
    },
  );
  it("refuses empty, duplicate and oversized batches", () => {
    [
      [],
      [firstId, firstId],
      Array.from({ length: 501 }, (_, index) => {
        return String(index);
      }),
    ].forEach((itemIds) => {
      expect(
        getMilestoneMovesFromTargets({
          milestone,
          itemIds,
          targets: Object.fromEntries(
            itemIds.map((id) => {
              return [id, "2026-09-18"];
            }),
          ),
        }),
      ).toBeUndefined();
    });
  });
});
