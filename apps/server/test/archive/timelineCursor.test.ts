import { describe, expect, it } from "vitest";
import { makeTimelineFilterFromQuery } from "../../src/archive/selectionFilter.ts";
import {
  getPageStateFromTimelineCursor,
  makeDigestFromFilter,
  makeOpenedIdsFromPage,
  makeTimelineCursorFromPageState,
} from "../../src/archive/timelineCursor.ts";

const FIRST_MILESTONE = "0199c0a0-0000-7000-8000-000000000001";
const SECOND_MILESTONE = "0199c0a0-0000-7000-8000-000000000002";

describe("the timeline cursor", () => {
  it("round-trips the day, the opened set and the digest", () => {
    const state = {
      lastDay: "2026-09-11",
      openedMilestoneIds: [FIRST_MILESTONE],
      filterDigest: "abc123",
    };
    expect(
      getPageStateFromTimelineCursor(makeTimelineCursorFromPageState(state)),
    ).toEqual(state);
  });

  it("is opaque, and carries no readable day", () => {
    const cursor = makeTimelineCursorFromPageState({
      lastDay: "2026-09-11",
      openedMilestoneIds: [],
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
      makeDigestFromFilter(
        makeTimelineFilterFromQuery({ tags: ["b", "a"] }),
      ),
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
    expect(makeDigestFromFilter(filter)).toBe(makeDigestFromFilter({ ...filter }));
  });

  it("moves when excludeAttached flips, though every other field matches", () => {
    const filter = makeTimelineFilterFromQuery({
      attachedToMilestoneId: "0199c0a0-0000-7000-8000-000000000001",
    });
    expect(makeDigestFromFilter({ ...filter, excludeAttached: false })).not.toBe(
      makeDigestFromFilter({ ...filter, excludeAttached: true }),
    );
  });
});

describe("makeOpenedIdsFromPage", () => {
  const milestones = [
    {
      milestoneId: FIRST_MILESTONE,
      name: "A week at the grandparents'",
      startsOn: "2026-09-08",
      endsOn: "2026-09-13",
      blurb: null,
    },
    {
      milestoneId: SECOND_MILESTONE,
      name: "Home from the hospital",
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
      blurb: null,
    },
  ];

  it("keeps an occasion that can still cover a later page", () => {
    expect(
      makeOpenedIdsFromPage({
        previousOpenedIds: [],
        bandedIds: [FIRST_MILESTONE],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([FIRST_MILESTONE]);
  });

  it("prunes one that starts at or after the last day", () => {
    expect(
      makeOpenedIdsFromPage({
        previousOpenedIds: [SECOND_MILESTONE],
        bandedIds: [],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([]);
  });

  it("keeps an id it cannot resolve, because it took a band somewhere", () => {
    expect(
      makeOpenedIdsFromPage({
        previousOpenedIds: ["0199c0a0-0000-7000-8000-0000000000ff"],
        bandedIds: [],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual(["0199c0a0-0000-7000-8000-0000000000ff"]);
  });

  it("does not repeat an id that was opened and banded again", () => {
    expect(
      makeOpenedIdsFromPage({
        previousOpenedIds: [FIRST_MILESTONE],
        bandedIds: [FIRST_MILESTONE],
        milestones,
        lastDay: "2026-09-11",
      }),
    ).toEqual([FIRST_MILESTONE]);
  });

  it("prunes one whose starts_on lands exactly on the last day", () => {
    expect(
      makeOpenedIdsFromPage({
        previousOpenedIds: [FIRST_MILESTONE],
        bandedIds: [],
        milestones,
        lastDay: "2026-09-08",
      }),
    ).toEqual([]);
  });
});
