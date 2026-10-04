import { describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../selectionFilterHelpers.ts";
import {
  getPageStateFromTimelineCursor,
  makeDigestFromFilter,
  makeTimelineCursorFromPageState,
} from "./timelineCursorHelpers.ts";

const FIRST_MILESTONE = "0199c0a0-0000-7000-8000-000000000001";

describe("the timeline cursor", () => {
  it("round-trips the day and digest", () => {
    const state = {
      lastDay: "2026-09-11",
      filterDigest: "abc123",
    };
    expect(
      getPageStateFromTimelineCursor(makeTimelineCursorFromPageState(state)),
    ).toEqual(state);
  });

  it("is opaque, and carries no readable day", () => {
    const cursor = makeTimelineCursorFromPageState({
      lastDay: "2026-09-11",
      filterDigest: "abc123",
    });
    expect(cursor).not.toContain("2026-09-11");
  });

  it("returns nothing for a cursor that does not decode", () => {
    expect(getPageStateFromTimelineCursor("not-a-cursor")).toBeUndefined();
    expect(getPageStateFromTimelineCursor("")).toBeUndefined();
    expect(
      getPageStateFromTimelineCursor(
        Buffer.from(JSON.stringify({ d: "yesterday" })).toString("base64url"),
      ),
    ).toBeUndefined();
  });
});

describe("makeDigestFromFilter", () => {
  it("is the same for two spellings of one selection", () => {
    expect(
      makeDigestFromFilter(makeTimelineFilterFromQuery({ tags: ["b", "a"] })),
    ).toBe(
      makeDigestFromFilter(
        makeTimelineFilterFromQuery({ tags: ["a", "b", "a"] }),
      ),
    );
  });

  it("differs when the selection differs", () => {
    expect(
      makeDigestFromFilter(makeTimelineFilterFromQuery({ tags: ["a"] })),
    ).not.toBe(
      makeDigestFromFilter(makeTimelineFilterFromQuery({ tags: ["b"] })),
    );
  });

  it("ignores the page size, which is not a different feed", () => {
    const filter = makeTimelineFilterFromQuery({ from: "2026-09-01" });
    expect(makeDigestFromFilter(filter)).toBe(
      makeDigestFromFilter({ ...filter }),
    );
  });

  it("moves when excludeAttached flips, though every other field matches", () => {
    const filter = makeTimelineFilterFromQuery({
      attachedToMilestoneId: "0199c0a0-0000-7000-8000-000000000001",
    });
    expect(
      makeDigestFromFilter({ ...filter, excludeAttached: false }),
    ).not.toBe(makeDigestFromFilter({ ...filter, excludeAttached: true }));
  });
});

describe("legacy timeline cursors", () => {
  it("validates legacy opened ids before discarding them", () => {
    const encode = (openedMilestoneIds: unknown) => {
      return Buffer.from(
        JSON.stringify({ d: "2026-09-11", f: "abc123", o: openedMilestoneIds }),
      ).toString("base64url");
    };
    expect(getPageStateFromTimelineCursor(encode([FIRST_MILESTONE]))).toEqual({
      lastDay: "2026-09-11",
      filterDigest: "abc123",
    });
    expect(getPageStateFromTimelineCursor(encode(["invalid"]))).toBeUndefined();
    expect(getPageStateFromTimelineCursor(encode(null))).toBeUndefined();
  });
});
