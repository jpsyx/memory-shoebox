import { describe, expect, it } from "vitest";
import { getDayBandAssignmentsFromMilestoneSpans } from "../../src/milestones/getDayBandAssignmentsFromMilestoneSpans.ts";
const week = {
  milestoneId: "mil-first-week",
  startsOn: "2026-09-17",
  endsOn: "2026-09-21",
};
const home = {
  milestoneId: "mil-home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
};
describe("global milestone band assignment", () => {
  it("matches the first worked example, including empty occasion days", () => {
    const assignments = getDayBandAssignmentsFromMilestoneSpans([home, week]);
    expect([...assignments.keys()]).toEqual([
      "2026-09-21",
      "2026-09-20",
      "2026-09-19",
      "2026-09-18",
      "2026-09-17",
    ]);
    expect(assignments.get("2026-09-21")).toEqual({
      bandMilestoneId: "mil-first-week",
      continuesMilestoneIds: [],
    });
    expect(assignments.get("2026-09-20")).toEqual({
      bandMilestoneId: null,
      continuesMilestoneIds: ["mil-first-week"],
    });
    expect(assignments.get("2026-09-17")).toEqual({
      bandMilestoneId: "mil-home",
      continuesMilestoneIds: ["mil-first-week"],
    });
    expect(assignments.get("2026-09-16")).toBeUndefined();
  });
  it("introduces only winners, so a strip can take tomorrow's band", () => {
    const assignments = getDayBandAssignmentsFromMilestoneSpans([
      week,
      { ...home, startsOn: "2026-09-21", endsOn: "2026-09-21" },
    ]);
    expect(assignments.get("2026-09-21")).toEqual({
      bandMilestoneId: "mil-home",
      continuesMilestoneIds: ["mil-first-week"],
    });
    expect(assignments.get("2026-09-20")).toEqual({
      bandMilestoneId: "mil-first-week",
      continuesMilestoneIds: [],
    });
    expect(assignments.get("2026-09-19")).toEqual({
      bandMilestoneId: null,
      continuesMilestoneIds: ["mil-first-week"],
    });
  });
  it("breaks equal-span ties by id and orders continuations by start then id", () => {
    const spans = [
      { ...week, milestoneId: "b" },
      { ...week, milestoneId: "a" },
      { ...week, milestoneId: "c", startsOn: "2026-09-16" },
    ];
    for (const rows of [spans, [...spans].reverse()]) {
      const assignments = getDayBandAssignmentsFromMilestoneSpans(rows);
      expect(assignments.get("2026-09-21")).toEqual({
        bandMilestoneId: "a",
        continuesMilestoneIds: ["c", "b"],
      });
      expect(assignments.get("2026-09-20")).toEqual({
        bandMilestoneId: "b",
        continuesMilestoneIds: ["c", "a"],
      });
    }
    expect(getDayBandAssignmentsFromMilestoneSpans([]).size).toBe(0);
  });
});
