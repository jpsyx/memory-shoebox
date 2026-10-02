import { describe, expect, it } from "vitest";
import {
  agoLabel,
  burstSpanLabel,
  captureMomentLabel,
  clockLabel,
  dateRangeLabel,
  dayLabel,
  dayMonthLabel,
  dayNumberLabel,
  framePositionLabel,
  getWallClockFromCapture,
  isMultiDayMilestone,
  milestoneDatesLabel,
  milestoneDayCount,
  milestoneDays,
  monthLabel,
  runtimeLabel,
  timeOfDayLabel,
  visibilityLabel,
} from "@/system/labelHelpers/labelHelpers";

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
    expect(agoLabel({ timestamp: "2026-09-25T12:00:00.000Z", now })).toBe(
      "3 days ago",
    );
    expect(agoLabel({ timestamp: "2026-09-28T09:00:00.000Z", now })).toBe(
      "3 hours ago",
    );
    expect(agoLabel({ timestamp: "2026-08-20T12:00:00.000Z", now })).toBe(
      "last month",
    );
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(agoLabel({ timestamp: "2026-09-27T11:00:00.000Z", now })).toBe(
      "yesterday",
    );
  });

  it("says just now inside the first minute", () => {
    expect(agoLabel({ timestamp: "2026-09-28T11:59:30.000Z", now })).toBe(
      "just now",
    );
  });

  it("never reads twelve months, which is a year by another name", () => {
    expect(agoLabel({ timestamp: "2025-10-03T12:00:00.000Z", now })).toBe(
      "11 months ago",
    );
    expect(agoLabel({ timestamp: "2025-09-28T12:00:00.000Z", now })).toBe(
      "last year",
    );
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

describe("dateRangeLabel", () => {
  it("drops whatever the two ends already share", () => {
    expect(dateRangeLabel({ from: "2026-09-01", until: "2026-09-30" })).toBe(
      "1 to 30 September 2026",
    );
    expect(dateRangeLabel({ from: "2026-09-14", until: "2026-10-02" })).toBe(
      "14 September to 2 October 2026",
    );
    expect(dateRangeLabel({ from: "2026-09-14", until: "2027-01-03" })).toBe(
      "14 September 2026 to 3 January 2027",
    );
  });

  it("reads a range of one day as that day", () => {
    expect(dateRangeLabel({ from: "2026-09-14", until: "2026-09-14" })).toBe(
      "14 September 2026",
    );
  });
});

describe("visibilityLabel", () => {
  it("prefers the label the server composed", () => {
    expect(
      visibilityLabel({
        visibilityRuleId: "r1",
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
        visibilityRuleId: "r1",
        mode: "except",
        label: null,
        subjects: [{ kind: "group", id: "g", displayName: "Cousins" }],
      }),
    ).toBe("Everyone except Cousins");
  });

  it("says Everyone for the default, whatever the subjects", () => {
    expect(
      visibilityLabel({
        visibilityRuleId: "visibility-rule-everyone",
        mode: "everyone",
        label: null,
        subjects: [],
      }),
    ).toBe("Everyone");
  });

  it("says Nobody yet for an only-rule with no subjects", () => {
    expect(
      visibilityLabel({
        visibilityRuleId: "r1",
        mode: "only",
        label: null,
        subjects: [],
      }),
    ).toBe("Nobody yet");
  });

  // Except nobody is everybody, and the two must keep saying so together.
  it("says Everyone for an except-rule with no subjects", () => {
    expect(
      visibilityLabel({
        visibilityRuleId: "r1",
        mode: "except",
        label: null,
        subjects: [],
      }),
    ).toBe("Everyone");
  });
});

describe("getWallClockFromCapture", () => {
  it("reads the clock the file carried when it carried an offset", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T04:41:00.000Z",
        offsetMinutes: 120,
        timezone: "America/New_York",
      }),
    ).toEqual({ date: "2026-09-14", time: "06:41" });
  });

  it("falls back to the Shoebox's timezone when the file carried none", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T04:41:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-14", time: "06:41" });
  });

  // The case the server's own rule exists for: 23:30 UTC is already the next
  // day in Madrid, and the day decides which pile the photograph sits on.
  it("puts a late photograph on the local day, not the UTC one", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T23:30:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-15", time: "01:30" });
  });

  // `hourCycle: "h23"` is what stops midnight reading "24:00".
  it("reads midnight as 00:00 rather than 24:00", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T22:00:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-15", time: "00:00" });
  });

  it("steps back a day when a negative offset crosses midnight", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-09-14T03:00:00.000Z",
        offsetMinutes: -300,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-09-13", time: "22:00" });
  });

  // Madrid moves from +01:00 to +02:00 at 01:00 UTC on 29 March 2026, so
  // 01:30 UTC is already 03:30 and the 02:xx hour never happened.
  it("follows the Shoebox's clock across a daylight-saving change", () => {
    expect(
      getWallClockFromCapture({
        capturedAt: "2026-03-29T01:30:00.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toEqual({ date: "2026-03-29", time: "03:30" });
  });
});

describe("timeOfDayLabel", () => {
  it.each([
    ["06:41", "6:41 am"],
    ["00:15", "12:15 am"],
    ["12:00", "12:00 pm"],
    ["19:02", "7:02 pm"],
  ])("reads %s as %s", (time, label) => {
    expect(timeOfDayLabel(time)).toBe(label);
  });
});

describe("captureMomentLabel", () => {
  it("says the day and the time together", () => {
    expect(captureMomentLabel({ date: "2026-09-14", time: "06:41" })).toBe(
      "14 September 2026, 6:41 am",
    );
  });
});

describe("dayMonthLabel", () => {
  it("drops the year, for the way back to a day", () => {
    expect(dayMonthLabel("2026-09-14")).toBe("14 September");
  });
});

describe("framePositionLabel", () => {
  it("counts the frame against the visible run", () => {
    expect(framePositionLabel({ position: 7, count: 45 })).toBe(
      "Frame 7 of 45",
    );
  });
});

describe("burstSpanLabel", () => {
  it.each([
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:44:00.000Z",
      "45 frames over 3 minutes",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:41:28.000Z",
      "45 frames over 28 seconds",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:41:00.400Z",
      "45 frames in a second",
    ],
    [
      "2026-09-14T04:41:00.000Z",
      "2026-09-14T04:42:01.000Z",
      "45 frames over a minute",
    ],
  ])("from %s to %s reads %s", (startsAt, endsAt, label) => {
    expect(burstSpanLabel({ visibleFrameCount: 45, startsAt, endsAt })).toBe(
      label,
    );
  });
});
