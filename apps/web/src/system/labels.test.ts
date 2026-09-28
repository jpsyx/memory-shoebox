import { describe, expect, it } from "vitest";
import {
  agoLabel,
  clockLabel,
  dayLabel,
  dayNumberLabel,
  isMultiDayMilestone,
  milestoneDatesLabel,
  milestoneDayCount,
  milestoneDays,
  monthLabel,
  runtimeLabel,
  visibilityLabel,
} from "@/system/labels";

const ONE_DAY = {
  milestoneId: "m1",
  name: "Mateo is born",
  startsOn: "2026-09-14",
  endsOn: "2026-09-14",
  blurb: null,
};

describe("clockLabel", () => {
  it("reads m:ss, which is what a family video is measured in", () => {
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(9)).toBe("0:09");
    expect(clockLabel(62)).toBe("1:02");
    expect(clockLabel(3661)).toBe("61:01");
  });

  it("floors a fractional second and never goes negative", () => {
    expect(clockLabel(8.9)).toBe("0:08");
    expect(clockLabel(-5)).toBe("0:00");
  });
});

describe("runtimeLabel", () => {
  it("turns the contract's milliseconds into a clock", () => {
    expect(runtimeLabel(22_000)).toBe("0:22");
    expect(runtimeLabel(95_400)).toBe("1:35");
  });
});

describe("the day labels", () => {
  it("says a date the way a person would", () => {
    expect(dayLabel("2026-09-14")).toBe("14 September 2026");
  });

  it("splits the spine's figure from its month", () => {
    expect(dayNumberLabel("2026-09-04")).toBe("4");
    expect(monthLabel("2026-09-04")).toBe("September");
  });
});

describe("agoLabel", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");

  it("counts in the largest unit that fits", () => {
    expect(agoLabel("2026-09-25T12:00:00.000Z", now)).toBe("3 days ago");
    expect(agoLabel("2026-09-28T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(agoLabel("2026-08-20T12:00:00.000Z", now)).toBe("last month");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(agoLabel("2026-09-27T11:00:00.000Z", now)).toBe("yesterday");
  });

  it("says just now inside the first minute", () => {
    expect(agoLabel("2026-09-28T11:59:30.000Z", now)).toBe("just now");
  });

  it("never reads twelve months, which is a year by another name", () => {
    expect(agoLabel("2025-10-03T12:00:00.000Z", now)).toBe("11 months ago");
    expect(agoLabel("2025-09-28T12:00:00.000Z", now)).toBe("last year");
  });
});

describe("the milestone labels", () => {
  it("treats a one-day occasion as a span whose ends are equal", () => {
    expect(isMultiDayMilestone(ONE_DAY)).toBe(false);
    expect(milestoneDays(ONE_DAY)).toEqual(["2026-09-14"]);
    expect(milestoneDatesLabel(ONE_DAY)).toBe("14 September 2026");
  });

  it("drops whatever the two ends already share", () => {
    expect(milestoneDatesLabel({ ...ONE_DAY, endsOn: "2026-09-18" })).toBe(
      "14 to 18 September 2026",
    );
    expect(milestoneDatesLabel({ ...ONE_DAY, endsOn: "2026-10-02" })).toBe(
      "14 September to 2 October 2026",
    );
    expect(milestoneDatesLabel({ ...ONE_DAY, endsOn: "2027-01-03" })).toBe(
      "14 September 2026 to 3 January 2027",
    );
  });

  it("counts the days of a span that crosses a month and a year", () => {
    expect(milestoneDayCount({ ...ONE_DAY, endsOn: "2026-10-02" })).toBe(19);
    expect(milestoneDayCount({ ...ONE_DAY, endsOn: "2027-01-03" })).toBe(112);
    expect(milestoneDayCount(ONE_DAY)).toBe(1);
  });

  it("lists every day of a span, both ends counted", () => {
    expect(milestoneDays({ ...ONE_DAY, endsOn: "2026-09-17" })).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
  });
});

describe("visibilityLabel", () => {
  it("prefers the label the server composed", () => {
    expect(
      visibilityLabel({
        mode: "only",
        label: "Just us two",
        subjects: [
          { kind: "member", id: "a", displayName: "Papá" },
          { kind: "member", id: "b", displayName: "Mamá" },
        ],
      }),
    ).toBe("Just us two");
  });

  it("composes from the subjects when the server sent none", () => {
    expect(
      visibilityLabel({
        mode: "except",
        label: null,
        subjects: [{ kind: "group", id: "g", displayName: "Cousins" }],
      }),
    ).toBe("Everyone except Cousins");
  });

  it("says Everyone for the default, whatever the subjects", () => {
    expect(
      visibilityLabel({ mode: "everyone", label: null, subjects: [] }),
    ).toBe("Everyone");
  });

  it("says Nobody yet for an only-rule with no subjects", () => {
    expect(visibilityLabel({ mode: "only", label: null, subjects: [] })).toBe(
      "Nobody yet",
    );
  });

  /* Except nobody is everybody, and the two must keep saying so together. */
  it("says Everyone for an except-rule with no subjects", () => {
    expect(visibilityLabel({ mode: "except", label: null, subjects: [] })).toBe(
      "Everyone",
    );
  });
});
