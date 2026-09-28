import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "../../../src/http/rateLimit/buckets.ts";

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
    const windows = [
      { limit: 1, windowSeconds: 60 },
      { limit: 10, windowSeconds: 86_400 },
    ];

    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });
    limiter.consume({ key: "invitation-1", windows, nowMs });

    // The minute window refused twice, so the day window has one, not three.
    const nextMinute = limiter.consume({
      key: "invitation-1",
      windows,
      nowMs: nowMs + 60_000,
    });
    expect(nextMinute.isAllowed).toBe(true);
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
