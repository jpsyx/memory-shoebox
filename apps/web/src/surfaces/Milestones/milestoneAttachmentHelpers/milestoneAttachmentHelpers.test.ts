import { describe, expect, it } from "vitest";
import { getMilestoneItemDeltaFromChoices } from "./milestoneAttachmentHelpers";
describe("explicit attachment deltas", () => {
  it("changes only observed IDs, retaining attached selections and ignoring unknown IDs", () => {
    expect(
      getMilestoneItemDeltaFromChoices({
        baseline: new Map([
          ["kept", true],
          ["removed", true],
          ["added", false],
        ]),
        chosen: new Map([
          ["kept", true],
          ["removed", false],
          ["added", true],
          ["unknown", true],
        ]),
      }),
    ).toEqual({ attach: ["added"], detach: ["removed"] });
  });
  it("empty and baseline-matching choices produce no attachment delta", () => {
    const baseline = new Map([
      ["attached", true],
      ["available", false],
    ]);
    expect(
      getMilestoneItemDeltaFromChoices({ baseline, chosen: new Map() }),
    ).toEqual({ attach: [], detach: [] });
    expect(
      getMilestoneItemDeltaFromChoices({ baseline, chosen: new Map(baseline) }),
    ).toEqual({ attach: [], detach: [] });
  });
  it.each([true, false] as const)(
    "rejects a 501-ID direction (%s)",
    (isAttach) => {
      const baseline = new Map(
        Array.from({ length: 501 }, (_, index) => {
          return [String(index), !isAttach];
        }),
      );
      const chosen = new Map(
        Array.from({ length: 501 }, (_, index) => {
          return [String(index), isAttach];
        }),
      );
      expect(() => {
        return getMilestoneItemDeltaFromChoices({ baseline, chosen });
      }).toThrow(/500/);
    },
  );
});
