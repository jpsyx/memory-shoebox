import { describe, expect, it } from "vitest";
import {
  countLocalDaysBetween,
  getLocalDayFromInstant,
} from "../../src/time/localDay.ts";

describe("getLocalDayFromInstant", () => {
  it("answers with the calendar day an instant fell on in that zone", () => {
    expect(
      getLocalDayFromInstant({
        instant: "2026-09-27T23:30:00.000Z",
        timezone: "UTC",
      }),
    ).toBe("2026-09-27");
    expect(
      getLocalDayFromInstant({
        instant: "2026-09-27T23:30:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe("2026-09-28");
    expect(
      getLocalDayFromInstant({
        instant: "2026-09-27T02:30:00.000Z",
        timezone: "America/Los_Angeles",
      }),
    ).toBe("2026-09-26");
  });
});

describe("countLocalDaysBetween", () => {
  it("counts whole calendar days, not elapsed hours", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-27T23:00:00.000Z",
        to: "2026-09-28T01:00:00.000Z",
        timezone: "UTC",
      }),
    ).toBe(1);
  });

  it("is zero inside one day however many hours have passed", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-27T00:01:00.000Z",
        to: "2026-09-27T23:59:00.000Z",
        timezone: "UTC",
      }),
    ).toBe(0);
  });

  it("counts a week as seven", () => {
    expect(
      countLocalDaysBetween({
        from: "2026-09-14T09:00:00.000Z",
        to: "2026-09-21T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(7);
  });
});
