import {
  getArchiveTotalsFromRail,
  makeRailPathFromSelection,
  makeTimelinePathFromView,
  makeTimelineQueryOptionsFromView,
} from "@/api/timeline/timeline";
import type { RailDay } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
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

  it("answers zero and no first day for an archive with nothing in it", () => {
    const totals = getArchiveTotalsFromRail([]);
    expect(totals).toEqual({
      itemTotal: 0,
      dayCount: 0,
      firstCapturedOn: undefined,
    });
    expect(totals.firstCapturedOn).toBeUndefined();
  });
});

describe("member-scoped attachment timeline", () => {
  it("pins the attachment picker URL", () => {
    const MILESTONE_ID = "018f0000-0000-7000-8000-000000008001";
    expect(
      makeTimelinePathFromView({
        view: {
          selection: {
            ...EMPTY,
            attachedToMilestoneId: MILESTONE_ID,
            excludeAttached: true,
          },
          at: undefined,
        },
      }),
    ).toBe(
      `/timeline?attachedToMilestoneId=${MILESTONE_ID}&excludeAttached=true`,
    );
  });
  it("separates members and attachment selections while preserving ordinary keys", () => {
    const view = { selection: EMPTY, at: undefined };
    expect(makeTimelineQueryOptionsFromView({ view }).queryKey).toEqual([
      "timeline",
      "",
    ]);
    expect(
      makeTimelineQueryOptionsFromView({ view, memberId: "one" }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({ view, memberId: "two" }).queryKey,
    );
    const attached = {
      selection: { ...EMPTY, attachedToMilestoneId: "id" },
      at: undefined,
    };
    expect(
      makeTimelineQueryOptionsFromView({
        view: attached,
        memberId: "one",
      }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({ view, memberId: "one" }).queryKey,
    );
    expect(
      makeTimelineQueryOptionsFromView({
        view: attached,
        memberId: "one",
      }).queryKey,
    ).not.toEqual(
      makeTimelineQueryOptionsFromView({
        view: {
          ...attached,
          selection: { ...attached.selection, excludeAttached: true },
        },
        memberId: "one",
      }).queryKey,
    );
  });
});
