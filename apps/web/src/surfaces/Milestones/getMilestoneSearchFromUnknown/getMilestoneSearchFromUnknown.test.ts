import { describe, expect, it } from "vitest";
import { getMilestoneSearchFromUnknown } from "./getMilestoneSearchFromUnknown";
const MILESTONE_ID = "018f0000-0000-7000-8000-000000008001" satisfies string;
describe("occasion addresses", () => {
  it("preserves list and create without an ID", () => {
    expect(getMilestoneSearchFromUnknown({})).toEqual({});
    expect(getMilestoneSearchFromUnknown({ mode: "create" })).toEqual({
      mode: "create",
    });
  });
  it.each(["created", "edit", "attach", "fix", "empty", "delete"] as const)(
    "preserves stored ID and %s",
    (mode) => {
      expect(
        getMilestoneSearchFromUnknown({ milestone: MILESTONE_ID, mode }),
      ).toEqual({
        milestone: MILESTONE_ID,
        mode,
      });
    },
  );
  it.each([
    { milestone: "bad/id", mode: "edit" },
    { mode: "delete" },
    { milestone: MILESTONE_ID, mode: "create" },
    { milestone: MILESTONE_ID },
    { mode: "wat" },
  ] as const)("refuses impossible address %j", (search) => {
    expect(() => {
      return getMilestoneSearchFromUnknown(search);
    }).toThrow();
  });
});
