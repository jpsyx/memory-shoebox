import { describe, expect, it } from "vitest";
import {
  getLocalWallClockFromInstant,
  makeInstantFromLocalWallClock,
} from "../../src/time/wallClockHelpers.ts";

describe("getLocalWallClockFromInstant", () => {
  it("reads the wall clock a stored offset implies, without a zone", () => {
    expect(
      getLocalWallClockFromInstant({
        instant: "2026-09-14T04:41:32.000Z",
        offsetMinutes: 120,
        timezone: "UTC",
      }),
    ).toBe("06:41:32");
  });

  it("falls back to the Shoebox zone when the file carried no offset", () => {
    expect(
      getLocalWallClockFromInstant({
        instant: "2026-09-14T04:41:32.000Z",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
    ).toBe("06:41:32");
  });
});

describe("makeInstantFromLocalWallClock", () => {
  it("keeps the clock time and moves only the day", () => {
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-09-20",
        localTime: "06:41:32",
        offsetMinutes: 120,
        timezone: "Europe/Madrid",
      }),
    ).toBe("2026-09-20T04:41:32.000Z");
  });

  it("resolves in the Shoebox zone when there is no stored offset", () => {
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-01-20",
        localTime: "06:41:32",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
      // January is CET, one hour ahead.
    ).toBe("2026-01-20T05:41:32.000Z");
  });

  it("takes the standard-time occurrence of an ambiguous wall clock", () => {
    // 25 October 2026: 03:00 CEST becomes 02:00 CET, so 02:30 happens twice.
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-10-25",
        localTime: "02:30:00",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
      // The second occurrence, at +01:00.
    ).toBe("2026-10-25T01:30:00.000Z");
  });

  it("takes the first occurrence in a zone behind UTC", () => {
    // 1 November 2026: 02:00 EDT becomes 01:00 EST, so 01:30 happens twice.
    // Behind UTC the convergence lands on the earlier, daylight-time
    // occurrence rather than the standard-time one, which is why the rule
    // is stated as the offset the naive instant reads at and not as
    // "standard time".
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-11-01",
        localTime: "01:30:00",
        offsetMinutes: null,
        timezone: "America/New_York",
      }),
      // The first occurrence, at -04:00.
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("shifts a nonexistent wall clock forward by the size of the gap", () => {
    // 29 March 2026: 02:00 CET becomes 03:00 CEST, so 02:30 never happens.
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-03-29",
        localTime: "02:30:00",
        offsetMinutes: null,
        timezone: "Europe/Madrid",
      }),
      // 03:30 CEST, an hour forward.
    ).toBe("2026-03-29T01:30:00.000Z");
  });

  it("shifts a nonexistent wall clock forward in a zone behind UTC too", () => {
    // 8 March 2026: 02:00 EST becomes 03:00 EDT, so 02:30 never happens.
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-03-08",
        localTime: "02:30:00",
        offsetMinutes: null,
        timezone: "America/New_York",
      }),
      // 03:30 EDT, an hour forward.
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    expect(
      makeInstantFromLocalWallClock({
        localDate: "2026-09-20",
        localTime: "06:41",
        offsetMinutes: 0,
        timezone: "UTC",
      }),
    ).toBe("2026-09-20T06:41:00.000Z");
  });
});
