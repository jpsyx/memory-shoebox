import { makeMilestoneDetailFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import { makeReconcileRequestFromTargets } from "./milestoneReconcileHelpers";
const FIRST_ITEM_ID = "018f0000-0000-7000-8000-00000000f001" satisfies string;
const SECOND_ITEM_ID = "018f0000-0000-7000-8000-00000000f002" satisfies string;
const milestone = {
  ...makeMilestoneDetailFromOverrides().milestone,
  startsOn: "2026-09-18",
  endsOn: "2026-09-20",
} satisfies MilestoneDetail["milestone"];
describe("explicit occasion move targets", () => {
  it("sends exactly the named dates", () => {
    expect(
      makeReconcileRequestFromTargets({
        milestone,
        itemIds: [FIRST_ITEM_ID, SECOND_ITEM_ID],
        targets: {
          [FIRST_ITEM_ID]: "2026-09-18",
          [SECOND_ITEM_ID]: "2026-09-20",
        },
      }),
    ).toEqual({
      mode: "move",
      moves: [
        { itemId: FIRST_ITEM_ID, targetOn: "2026-09-18" },
        { itemId: SECOND_ITEM_ID, targetOn: "2026-09-20" },
      ],
    });
  });
  it.each([undefined, "", "2026-09-17", "2026-09-21", "2026-09-19x"] as const)(
    "refuses a missing or outside target %s",
    (target) => {
      expect(
        makeReconcileRequestFromTargets({
          milestone,
          itemIds: [FIRST_ITEM_ID, SECOND_ITEM_ID],
          targets: { [FIRST_ITEM_ID]: "2026-09-18", [SECOND_ITEM_ID]: target },
        }),
      ).toBeUndefined();
    },
  );
  it("refuses empty, duplicate and oversized batches", () => {
    [
      [],
      [FIRST_ITEM_ID, FIRST_ITEM_ID],
      Array.from({ length: 501 }, (_, index) => {
        return String(index);
      }),
    ].forEach((itemIds) => {
      expect(
        makeReconcileRequestFromTargets({
          milestone,
          itemIds,
          targets: Object.fromEntries(
            itemIds.map((itemId) => {
              return [itemId, "2026-09-18"];
            }),
          ),
        }),
      ).toBeUndefined();
    });
  });
});
