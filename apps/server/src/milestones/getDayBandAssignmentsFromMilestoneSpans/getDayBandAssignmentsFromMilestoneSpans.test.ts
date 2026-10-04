import type { MilestoneSpanRow } from "./getDayBandAssignmentsFromMilestoneSpans.ts";
import { describe, expect, it } from "vitest";
import { getDayBandAssignmentsFromMilestoneSpans } from "./getDayBandAssignmentsFromMilestoneSpans.ts";
const WEEK = {
  milestoneId: "mil-first-week",
  startsOn: "2026-09-17",
  endsOn: "2026-09-21",
} as const satisfies MilestoneSpanRow;
const HOME = {
  milestoneId: "mil-home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
} as const satisfies MilestoneSpanRow;

function _assertMatchesTheFirstWorkedExampleIncludingEmptyOccasion1(): void {
  const assignments = getDayBandAssignmentsFromMilestoneSpans([HOME, WEEK]);
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
    bandMilestoneId: undefined,
    continuesMilestoneIds: ["mil-first-week"],
  });
  expect(assignments.get("2026-09-17")).toEqual({
    bandMilestoneId: "mil-home",
    continuesMilestoneIds: ["mil-first-week"],
  });
  expect(assignments.get("2026-09-16")).toBeUndefined();
}

function _assertIntroducesOnlyWinnersSoAStripCanTake2(): void {
  const assignments = getDayBandAssignmentsFromMilestoneSpans([
    WEEK,
    { ...HOME, startsOn: "2026-09-21", endsOn: "2026-09-21" },
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
    bandMilestoneId: undefined,
    continuesMilestoneIds: ["mil-first-week"],
  });
}

function _assertBreaksEqualSpanTiesByIdAndOrders3(): void {
  const spans = [
    { ...WEEK, milestoneId: "b" },
    { ...WEEK, milestoneId: "a" },
    { ...WEEK, milestoneId: "c", startsOn: "2026-09-16" },
  ];
  [spans, [...spans].reverse()].forEach((rows) => {
    const assignments = getDayBandAssignmentsFromMilestoneSpans(rows);
    expect(assignments.get("2026-09-21")).toEqual({
      bandMilestoneId: "a",
      continuesMilestoneIds: ["c", "b"],
    });
    expect(assignments.get("2026-09-20")).toEqual({
      bandMilestoneId: "b",
      continuesMilestoneIds: ["c", "a"],
    });
  });
  expect(getDayBandAssignmentsFromMilestoneSpans([]).size).toBe(0);
}
describe("global milestone band assignment", () => {
  it(
    "matches the first worked example, including empty occasion days",
    _assertMatchesTheFirstWorkedExampleIncludingEmptyOccasion1,
  );
  it(
    "introduces only winners, so a strip can take the next older feed day's band",
    _assertIntroducesOnlyWinnersSoAStripCanTake2,
  );
  it(
    "breaks equal-span ties by id and orders continuations by start then id",
    _assertBreaksEqualSpanTiesByIdAndOrders3,
  );
});
