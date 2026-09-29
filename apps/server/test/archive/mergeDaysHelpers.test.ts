import { describe, expect, it } from "vitest";
import {
  getUnionDaysFromMilestones,
  getWindowFloorFromItemDays,
  makeDayPageFromCandidates,
  makeMergedDays,
} from "../../src/archive/mergeDaysHelpers.ts";

const WEEK = {
  milestoneId: "0199c0a0-0000-7000-8000-000000000001",
  name: "A week at the grandparents'",
  startsOn: "2026-09-09",
  endsOn: "2026-09-13",
  blurb: null,
};

const makeDay = (capturedOn: string, itemCount: number) => {
  return { capturedOn, itemCount, unseenCount: 0 };
};

describe("getUnionDaysFromMilestones", () => {
  it("expands a span into its days", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("clips to the date range, which a date filter keeps", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: "2026-09-11",
        untilDay: "2026-09-12",
        beforeDay: undefined,
        sinceDay: undefined,
      }),
    ).toEqual(["2026-09-11", "2026-09-12"]);
  });

  it("stops strictly before the cursor day, and at the window's floor", () => {
    expect(
      getUnionDaysFromMilestones({
        milestones: [WEEK],
        fromDay: undefined,
        untilDay: undefined,
        beforeDay: "2026-09-12",
        sinceDay: "2026-09-10",
      }),
    ).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("de-duplicates a day shared by two overlapping occasions", () => {
    const overlapping = {
      milestoneId: "0199c0a0-0000-7000-8000-000000000002",
      name: "A visit that ran long",
      startsOn: "2026-09-12",
      endsOn: "2026-09-15",
      blurb: null,
    };

    const days = getUnionDaysFromMilestones({
      milestones: [WEEK, overlapping],
      fromDay: undefined,
      untilDay: undefined,
      beforeDay: undefined,
      sinceDay: undefined,
    });

    expect(days).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
  });
});

describe("getWindowFloorFromItemDays", () => {
  it("has no floor when there are fewer item days than the limit", () => {
    expect(
      getWindowFloorFromItemDays({
        itemDays: [makeDay("2026-09-14", 1), makeDay("2026-09-13", 1)],
        limit: 3,
      }),
    ).toBeUndefined();
  });

  it("has no floor when there are exactly the limit's worth of item days", () => {
    expect(
      getWindowFloorFromItemDays({
        itemDays: [
          makeDay("2026-09-14", 1),
          makeDay("2026-09-13", 1),
          makeDay("2026-09-12", 1),
        ],
        limit: 3,
      }),
    ).toBeUndefined();
  });

  it("floors at the (limit + 1)-th item day when one comes back", () => {
    expect(
      getWindowFloorFromItemDays({
        itemDays: [
          makeDay("2026-09-14", 1),
          makeDay("2026-09-13", 1),
          makeDay("2026-09-12", 1),
          makeDay("2026-09-11", 1),
        ],
        limit: 3,
      }),
    ).toBe("2026-09-11");
  });
});

describe("makeMergedDays", () => {
  it("puts milestone-only days in place, newest first", () => {
    expect(
      makeMergedDays({
        itemDays: [makeDay("2026-09-14", 212), makeDay("2026-09-02", 1)],
        milestoneDays: ["2026-09-13"],
      }),
    ).toEqual([
      makeDay("2026-09-14", 212),
      makeDay("2026-09-13", 0),
      makeDay("2026-09-02", 1),
    ]);
  });

  it("does not duplicate a day that has both items and an occasion", () => {
    expect(
      makeMergedDays({
        itemDays: [makeDay("2026-09-14", 212)],
        milestoneDays: ["2026-09-14"],
      }),
    ).toEqual([makeDay("2026-09-14", 212)]);
  });
});

describe("makeDayPageFromCandidates", () => {
  it("cuts at the limit and says there is more", () => {
    const page = makeDayPageFromCandidates({
      candidates: [
        makeDay("2026-09-14", 1),
        makeDay("2026-09-13", 1),
        makeDay("2026-09-12", 1),
      ],
      limit: 2,
      itemBudget: 400,
    });
    expect(
      page.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
    expect(page.hasMore).toBe(true);
  });

  it("says there is no more when everything fits", () => {
    const page = makeDayPageFromCandidates({
      candidates: [makeDay("2026-09-14", 1)],
      limit: 10,
      itemBudget: 400,
    });
    expect(page.hasMore).toBe(false);
  });

  it("stops after the day that passes the budget", () => {
    const page = makeDayPageFromCandidates({
      candidates: [
        makeDay("2026-09-14", 300),
        makeDay("2026-09-13", 150),
        makeDay("2026-09-12", 10),
      ],
      limit: 10,
      itemBudget: 400,
    });
    expect(
      page.days.map((day) => {
        return day.capturedOn;
      }),
    ).toEqual(["2026-09-14", "2026-09-13"]);
    expect(page.hasMore).toBe(true);
  });

  it("always returns one day, however fat it is", () => {
    const page = makeDayPageFromCandidates({
      candidates: [makeDay("2026-09-14", 4000), makeDay("2026-09-13", 1)],
      limit: 10,
      itemBudget: 400,
    });
    expect(page.days).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});
