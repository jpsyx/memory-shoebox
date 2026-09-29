import { describe, expect, it } from "vitest";
import type { MilestoneRef } from "@memory-shoebox/shared";
import {
  getDayCountFromMilestone,
  getDayPositionFromMilestone,
  getDaysFromMilestone,
  rankMilestonesForDay,
} from "../../src/archive/milestoneSpans.ts";

/** A five-day visit and the one-day occasion inside it. */
const WEEK: MilestoneRef = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000001",
  name: "Mateo's first week at home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-21",
  blurb: null,
};
const DAY: MilestoneRef = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000002",
  name: "Home from the hospital",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

describe("span arithmetic", () => {
  it("counts both ends", () => {
    expect(getDayCountFromMilestone(WEEK)).toBe(5);
    expect(getDayCountFromMilestone(DAY)).toBe(1);
  });

  it("lists every date in the span", () => {
    expect(getDaysFromMilestone(WEEK)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
  });

  it("counts a position from one", () => {
    expect(
      getDayPositionFromMilestone({ milestone: WEEK, day: "2026-09-19" }),
    ).toBe(3);
  });

  it("gives no position to a day before the span", () => {
    expect(
      getDayPositionFromMilestone({ milestone: WEEK, day: "2026-09-16" }),
    ).toBe(0);
  });

  it("gives no position to a day after the span", () => {
    expect(
      getDayPositionFromMilestone({ milestone: WEEK, day: "2026-09-22" }),
    ).toBe(0);
  });

  it("crosses a month and a year without drifting", () => {
    const newYear: MilestoneRef = {
      ...DAY,
      startsOn: "2026-12-30",
      endsOn: "2027-01-02",
    };
    expect(getDayCountFromMilestone(newYear)).toBe(4);
    expect(getDaysFromMilestone(newYear)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
});

describe("rankMilestonesForDay", () => {
  it("gives the band to the narrowest span and strips the rest", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-17",
      openedMilestoneIds: [],
    });
    expect(ranked.band?.milestoneId).toBe(DAY.milestoneId);
    expect(
      ranked.strips.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([WEEK.milestoneId]);
  });

  it("breaks a tie by the earliest start", () => {
    const later: MilestoneRef = {
      ...DAY,
      milestoneId: "0199c0a0-0000-7000-8000-000000000003",
      startsOn: "2026-09-18",
      endsOn: "2026-09-22",
    };
    const ranked = rankMilestonesForDay({
      milestones: [later, WEEK],
      day: "2026-09-18",
      openedMilestoneIds: [],
    });
    expect(ranked.band?.milestoneId).toBe(WEEK.milestoneId);
  });

  it("never opens a second band for an occasion already opened", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-17",
      openedMilestoneIds: [DAY.milestoneId],
    });
    expect(ranked.band?.milestoneId).toBe(WEEK.milestoneId);
    expect(
      ranked.strips.map((milestone) => {
        return milestone.milestoneId;
      }),
    ).toEqual([DAY.milestoneId]);
  });

  it("leaves a day with no band when everything covering it has opened", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK],
      day: "2026-09-19",
      openedMilestoneIds: [WEEK.milestoneId],
    });
    expect(ranked.band).toBeUndefined();
    expect(ranked.strips).toHaveLength(1);
  });

  it("ignores an occasion that does not cover the day", () => {
    const ranked = rankMilestonesForDay({
      milestones: [WEEK, DAY],
      day: "2026-09-25",
      openedMilestoneIds: [],
    });
    expect(ranked.band).toBeUndefined();
    expect(ranked.strips).toEqual([]);
  });

  it("breaks a true tie (same start, same width) by input order", () => {
    const twinA: MilestoneRef = {
      ...DAY,
      milestoneId: "0199c0a0-0000-7000-8000-000000000004",
    };
    const twinB: MilestoneRef = {
      ...DAY,
      milestoneId: "0199c0a0-0000-7000-8000-000000000005",
    };

    const bandsAFirst = rankMilestonesForDay({
      milestones: [twinA, twinB],
      day: "2026-09-17",
      openedMilestoneIds: [],
    });
    expect(bandsAFirst.band?.milestoneId).toBe(twinA.milestoneId);

    const bandsBFirst = rankMilestonesForDay({
      milestones: [twinB, twinA],
      day: "2026-09-17",
      openedMilestoneIds: [],
    });
    expect(bandsBFirst.band?.milestoneId).toBe(twinB.milestoneId);
  });
});
