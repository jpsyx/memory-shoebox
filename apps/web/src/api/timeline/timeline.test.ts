import { describe, expect, it } from "vitest";
import type { RailDay } from "@memory-shoebox/shared";
import {
  getArchiveTotalsFromRail,
  makeRailPathFromSelection,
  makeTimelinePathFromView,
} from "@/api/timeline/timeline";

const EMPTY = { tags: [], people: [], from: undefined, until: undefined };

describe("makeTimelinePathFromView", () => {
  it("asks for the whole archive when nothing is chosen", () => {
    expect(
      makeTimelinePathFromView({ view: { selection: EMPTY, at: undefined } }),
    ).toBe("/timeline");
  });

  it("carries the selection", () => {
    expect(
      makeTimelinePathFromView({
        view: { selection: { ...EMPTY, tags: ["a", "b"] }, at: undefined },
      }),
    ).toBe("/timeline?tags=a&tags=b");
  });

  it("carries the cursor on a later page", () => {
    expect(
      makeTimelinePathFromView({
        view: { selection: EMPTY, at: undefined },
        cursor: "abc123",
      }),
    ).toBe("/timeline?cursor=abc123");
  });
});

describe("makeRailPathFromSelection", () => {
  it("never sends a limit or a cursor, which the route rejects", () => {
    const path = makeRailPathFromSelection({ ...EMPTY, people: ["p"] });
    expect(path).toBe("/timeline/rail?people=p");
    expect(path).not.toContain("limit");
    expect(path).not.toContain("cursor");
  });
});

describe("getArchiveTotalsFromRail", () => {
  const days: readonly RailDay[] = [
    { capturedOn: "2026-09-27", itemCount: 340 },
    { capturedOn: "2026-09-22", itemCount: 0 },
    { capturedOn: "2026-07-04", itemCount: 4 },
  ];

  it("sums the items, counts the days and finds the first", () => {
    expect(getArchiveTotalsFromRail(days)).toEqual({
      itemTotal: 344,
      dayCount: 3,
      firstCapturedOn: "2026-07-04",
    });
  });

  it("counts a milestone-only day as a day, because it is jumpable", () => {
    expect(getArchiveTotalsFromRail(days).dayCount).toBe(3);
  });

  it("answers zero and null for an archive with nothing in it", () => {
    expect(getArchiveTotalsFromRail([])).toEqual({
      itemTotal: 0,
      dayCount: 0,
      firstCapturedOn: null,
    });
  });
});
