import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "../../../src/http/rateLimit/createFixedWindowLimiter.ts";

const ONE_PER_MINUTE = [{ limit: 1, windowSeconds: 60 }];
const FIVE_PER_HOUR = [{ limit: 5, windowSeconds: 3600 }];

describe("createFixedWindowLimiter", () => {
  it("allows up to the limit and refuses the next one", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        limiter.consume({
          key: "rosa@example.com",
          windows: FIVE_PER_HOUR,
          nowMs,
        }).isAllowed,
      ).toBe(true);
    }

    expect(
      limiter.consume({
        key: "rosa@example.com",
        windows: FIVE_PER_HOUR,
        nowMs,
      }).isAllowed,
    ).toBe(false);
  });

  it("reports the seconds left in the window", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:10.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });
    const refused = limiter.consume({
      key: "rosa",
      windows: ONE_PER_MINUTE,
      nowMs,
    });

    expect(refused.isAllowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(50);
  });

  it("starts again in the next window", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:10.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });
    const next = limiter.consume({
      key: "rosa",
      windows: ONE_PER_MINUTE,
      nowMs: nowMs + 60_000,
    });

    expect(next.isAllowed).toBe(true);
  });

  it("keeps separate counts per key", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    limiter.consume({ key: "rosa", windows: ONE_PER_MINUTE, nowMs });

    expect(
      limiter.consume({ key: "ines", windows: ONE_PER_MINUTE, nowMs })
        .isAllowed,
    ).toBe(true);
  });

  it("refuses when any window is full, and consumes nothing when it refuses", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");
    // Two a day rather than ten, so that the day window can tell the two
    // implementations apart: charging on refusal would fill it in the burst.
    const windows = [
      { limit: 1, windowSeconds: 60 },
      { limit: 2, windowSeconds: 86_400 },
    ];

    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });

    // The minute window refused twice, so the day window has one, not three,
    // and the second of the day's two is still there to spend.
    const nextMinute = limiter.consume({
      key: "invitation-1",
      windows,
      nowMs: nowMs + 60_000,
    });
    expect(nextMinute.isAllowed).toBe(true);

    // That spent it. The day window is now full, so a fresh minute is not
    // enough: this is the assertion that the day window was charged once by
    // the burst and not three times.
    const minuteAfter = limiter.consume({
      key: "invitation-1",
      windows,
      nowMs: nowMs + 120_000,
    });
    expect(minuteAfter.isAllowed).toBe(false);
  });

  it("refuses the first request against a window of zero", () => {
    const limiter = createFixedWindowLimiter();
    const nowMs = Date.parse("2026-09-27T10:00:10.000Z");

    // No rule in the table uses zero today. One that did would mean "closed",
    // and a limiter that consults the limit only once a counter exists would
    // let the first request through the closed door.
    const refused = limiter.consume({
      key: "rosa",
      windows: [{ limit: 0, windowSeconds: 60 }],
      nowMs,
    });

    expect(refused.isAllowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(50);
  });

  it("forgets windows that have passed rather than growing without bound", () => {
    const limiter = createFixedWindowLimiter({ pruneEvery: 2 });
    const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

    limiter.consume({ key: "one", windows: ONE_PER_MINUTE, nowMs });
    limiter.consume({ key: "two", windows: ONE_PER_MINUTE, nowMs });
    expect(limiter.size()).toBe(2);

    limiter.consume({
      key: "three",
      windows: ONE_PER_MINUTE,
      nowMs: nowMs + 600_000,
    });
    limiter.consume({
      key: "four",
      windows: ONE_PER_MINUTE,
      nowMs: nowMs + 600_000,
    });

    expect(limiter.size()).toBe(2);
  });
});
