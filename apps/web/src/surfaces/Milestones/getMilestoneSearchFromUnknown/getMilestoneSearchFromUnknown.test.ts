import { describe, expect, it } from "vitest";
import { getMilestoneSearchFromUnknown } from "./getMilestoneSearchFromUnknown";
const milestone = "018f0000-0000-7000-8000-000000008001";
describe("occasion addresses", () => {
  it("preserves list and create without an ID", () => {
    expect(getMilestoneSearchFromUnknown({})).toEqual({});
    expect(getMilestoneSearchFromUnknown({ mode: "create" })).toEqual({
      mode: "create",
    });
  });
  it.each(["created", "edit", "attach", "fix", "empty", "delete"])(
    "preserves stored ID and %s",
    (mode) => {
      expect(getMilestoneSearchFromUnknown({ milestone, mode })).toEqual({
        milestone,
        mode,
      });
    },
  );
  it.each([
    { milestone: "bad/id", mode: "edit" },
    { mode: "delete" },
    { milestone, mode: "create" },
    { milestone },
    { mode: "wat" },
  ])("refuses impossible address %j", (search) => {
    expect(() => {
      return getMilestoneSearchFromUnknown(search);
    }).toThrow();
  });
});
