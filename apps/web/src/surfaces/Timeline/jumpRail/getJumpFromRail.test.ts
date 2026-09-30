import { describe, expect, it } from "vitest";
import { getJumpFromRail } from "@/surfaces/Timeline/jumpRail/getJumpFromRail";

describe("getJumpFromRail", () => {
  const loaded = ["2026-09-27", "2026-09-26", "2026-09-25"];

  it("scrolls to a day that is already on the page", () => {
    expect(
      getJumpFromRail({ capturedOn: "2026-09-26", loadedDays: loaded }),
    ).toEqual({
      kind: "scroll",
      anchorId: "day-2026-09-26",
    });
  });

  it("restarts the stream at a day that is not", () => {
    expect(
      getJumpFromRail({ capturedOn: "2024-02-11", loadedDays: loaded }),
    ).toEqual({
      kind: "restart",
      at: "2024-02-11",
    });
  });

  it("restarts from an empty pile rather than scrolling nowhere", () => {
    expect(
      getJumpFromRail({ capturedOn: "2026-09-26", loadedDays: [] }),
    ).toEqual({
      kind: "restart",
      at: "2026-09-26",
    });
  });
});
