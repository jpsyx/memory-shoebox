import { describe, expect, it } from "vitest";
import { createSendRateLimiter } from "../../../src/mail/EmailService/createSendRateLimiter.ts";

/** A clock and a sleep that record rather than wait. */
function _createFakeTime() {
  const slept: number[] = [];
  let nowMs = 0;
  return {
    slept,
    now: () => {
      return nowMs;
    },
    sleep: (ms: number) => {
      nowMs += ms;
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

describe("createSendRateLimiter", () => {
  it("limits in memory when Upstash is not configured", () => {
    const limiter = createSendRateLimiter({ upstash: undefined });

    expect(limiter.kind).toBe("memory");
  });

  it("lets the first send through without waiting", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();

    expect(time.slept).toEqual([]);
  });

  it("spaces the second send rather than refusing it", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();
    await limiter.acquire();

    expect(time.slept).toHaveLength(1);
    expect(time.slept[0]).toBeGreaterThan(0);
  });

  it("holds a burst of ten under two a second", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    const startedAt = time.now();
    for (let index = 0; index < 10; index += 1) {
      await limiter.acquire();
    }

    // Nine gaps between ten sends, and the whole burst may not fit into the
    // window that two a second would allow for ten.
    const elapsed = time.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(9 * 500);
  });

  it("stops waiting once the gap has already passed", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({ upstash: undefined, ...time });

    await limiter.acquire();
    await time.sleep(5_000);
    time.slept.length = 0;
    await limiter.acquire();

    expect(time.slept).toEqual([]);
  });
});

/** Placeholder credentials. Nothing in this file reaches Upstash. */
const UPSTASH = { restUrl: "https://upstash.invalid", restToken: "unused" };

/**
 * An Upstash limiter that answers from a script rather than over the network.
 *
 * Each answer is `undefined` for a pass, or the `reset` it refuses with.
 * Running off the end of the script repeats the last answer, so a test can say
 * "always refuses" with one entry.
 */
function _createFakeUpstash(answers: Array<number | undefined>) {
  const asked: string[] = [];
  return {
    asked,
    limit: (identifier: string) => {
      const answer = answers[Math.min(asked.length, answers.length - 1)];
      asked.push(identifier);
      return Promise.resolve({
        success: answer === undefined,
        reset: answer ?? 0,
      });
    },
  };
}

/** An Upstash that cannot be reached at all, however often it is asked. */
function _createUnreachableUpstash() {
  return {
    limit: () => {
      return Promise.reject(new Error("upstash is unreachable"));
    },
  };
}

describe("createSendRateLimiter, on Upstash", () => {
  it("names Upstash as the store when it is configured", () => {
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: _createFakeUpstash([undefined]),
    });

    expect(limiter.kind).toBe("upstash");
  });

  it("passes straight through when Upstash says yes", async () => {
    const time = _createFakeTime();
    const upstash = _createFakeUpstash([undefined]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    expect(upstash.asked).toHaveLength(1);
    expect(time.slept).toEqual([]);
  });

  it("waits for the moment Upstash names rather than refusing", async () => {
    const time = _createFakeTime();
    const upstash = _createFakeUpstash([700, undefined]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    expect(time.slept).toEqual([700]);
    expect(upstash.asked).toHaveLength(2);
  });

  it("cannot spin on a moment that has already passed", async () => {
    const time = _createFakeTime();
    // A reset in the past: the gap to it is negative, so an unclamped wait
    // would be no wait at all and the loop would become a busy one.
    const upstash = _createFakeUpstash([-5_000, undefined]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    expect(time.slept).toEqual([100]);
  });

  it("ignores a reset that a disagreeing clock puts hours away", async () => {
    const time = _createFakeTime();
    const upstash = _createFakeUpstash([3_600_000, undefined]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    expect(time.slept).toEqual([2_000]);
  });

  it("waits a fixed gap when the reset is not a usable number", async () => {
    const time = _createFakeTime();
    const upstash = _createFakeUpstash([Number.NaN, undefined]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    expect(time.slept).toEqual([500]);
  });

  it("goes ahead rather than waiting on a refusal that never lifts", async () => {
    const time = _createFakeTime();
    const upstash = _createFakeUpstash([700]);
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: upstash,
      now: time.now,
      sleep: time.sleep,
    });

    await limiter.acquire();

    // The deadline is thirty seconds, and the last wait may overshoot it by
    // one gap. What matters is that it returned at all.
    expect(time.now()).toBeGreaterThanOrEqual(30_000);
    expect(time.now()).toBeLessThan(32_000);
    // This reset never moves, so every wait after the first falls to the
    // hundred-millisecond floor: thirty seconds of refusals costs three
    // hundred asks, not an unbounded number of them.
    expect(upstash.asked.length).toBeLessThanOrEqual(301);
  });

  it("falls back to this process's window when Upstash cannot be reached", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: _createUnreachableUpstash(),
      now: time.now,
      sleep: time.sleep,
      onDegraded: () => {},
    });

    await limiter.acquire();
    expect(time.slept).toEqual([]);

    await limiter.acquire();

    // Spaced by the in-process window rather than not spaced at all, and
    // acquiring never rejected.
    expect(time.slept).toHaveLength(1);
    expect(time.slept[0]).toBeGreaterThan(0);
  });

  it("stops calling itself shared once the shared store has gone", async () => {
    const time = _createFakeTime();
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: _createUnreachableUpstash(),
      now: time.now,
      sleep: time.sleep,
      onDegraded: () => {},
    });

    // Configured for Upstash, and nothing yet says it is not working.
    expect(limiter.kind).toBe("upstash");

    await limiter.acquire();

    // A health check that still read "upstash" here would call an instance
    // healthy whose budget is no longer shared with anything.
    expect(limiter.kind).toBe("upstash_unreachable");
  });

  it("calls itself shared again once Upstash answers", async () => {
    const time = _createFakeTime();
    let reachable = false;
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: {
        limit: () => {
          return reachable
            ? Promise.resolve({ success: true, reset: 0 })
            : Promise.reject(new Error("upstash is unreachable"));
        },
      },
      now: time.now,
      sleep: time.sleep,
      onDegraded: () => {},
    });

    await limiter.acquire();
    expect(limiter.kind).toBe("upstash_unreachable");

    reachable = true;
    await limiter.acquire();

    expect(limiter.kind).toBe("upstash");
  });

  it("says so once when the shared budget goes, not on every send", async () => {
    const time = _createFakeTime();
    const degraded: unknown[] = [];
    const limiter = createSendRateLimiter({
      upstash: UPSTASH,
      upstashLimitApi: _createUnreachableUpstash(),
      now: time.now,
      sleep: time.sleep,
      onDegraded: (error) => {
        degraded.push(error);
      },
    });

    await limiter.acquire();
    await limiter.acquire();

    // Once for the transition, not once per message: a queue draining a
    // hundred rows must not write a hundred warnings.
    expect(degraded).toHaveLength(1);
    expect(degraded[0]).toBeInstanceOf(Error);
  });
});
