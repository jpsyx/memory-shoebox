import { describe, expect, it } from "vitest";
import { getWeekIndexFromCreatedAt } from "../../src/jobs/getWeekIndexFromCreatedAt.ts";

describe("getWeekIndexFromCreatedAt", () => {
  it("is zero in the week of the request", () => {
    expect(
      getWeekIndexFromCreatedAt({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-20T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(0);
  });

  it("is one from the seventh day", () => {
    expect(
      getWeekIndexFromCreatedAt({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-21T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(1);
  });

  it("is two a fortnight later", () => {
    expect(
      getWeekIndexFromCreatedAt({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-28T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(2);
  });

  it("counts calendar days in the zone, not elapsed hours", () => {
    // Madrid springs forward on 2026-03-29, so the same local hour one week
    // later is 167 hours away and an elapsed-milliseconds division would
    // answer zero. The week is seven local midnights, so it is one.
    const createdAt = "2026-03-25T08:00:00.000Z";
    const now = "2026-04-01T07:00:00.000Z";
    expect(Date.parse(now) - Date.parse(createdAt)).toBeLessThan(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(
      getWeekIndexFromCreatedAt({ createdAt, now, timezone: "Europe/Madrid" }),
    ).toBe(1);
  });
});
