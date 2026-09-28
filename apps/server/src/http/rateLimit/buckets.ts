/** One allowance: how many requests, over how long. */
export type RateLimitWindow = {
  limit: number;
  windowSeconds: number;
};

/** What the limiter decided, and what to tell the caller if it refused. */
export type RateLimitOutcome = {
  isAllowed: boolean;
  /** Zero when allowed. Seconds until the fullest window turns over. */
  retryAfterSeconds: number;
};

/** A counter store with no persistence and no knowledge of what it counts. */
export type FixedWindowLimiter = {
  consume: (options: {
    key: string;
    windows: readonly RateLimitWindow[];
    nowMs: number;
  }) => RateLimitOutcome;
  /** Drops every counter. Tests use it; nothing in the server does. */
  reset: () => void;
  /** How many live counters are held. Diagnostics and tests only. */
  size: () => number;
};

/** One counter, and the instant after which it means nothing. */
type Counter = {
  count: number;
  expiresAtMs: number;
};

/** How many calls between sweeps of counters whose window has passed. */
const DEFAULT_PRUNE_EVERY = 1000;

/**
 * Builds an in-memory fixed-window rate limiter.
 *
 * **Fixed windows rather than a token bucket**, because
 * `apis/conventions.md` § Errors requires `details.retryAfterSeconds` and a
 * fixed window has an exact answer for it: the seconds until the window turns
 * over. A leaky bucket's answer is an estimate, and this number is printed to
 * somebody waiting.
 *
 * **In memory rather than in SQLite.** The deployment is one Fly machine
 * (`docs/architecture.md`), and a counter row per request would put write
 * contention on the one part of the system with a single writer. The cost is
 * that a restart forgets every count, which is the right trade for limits
 * whose longest window is an hour.
 *
 * **Nothing here is ever written down.** The per-IP bucket is the only place
 * in the product that touches an address (`data-models.md` § Privacy), and it
 * touches it as a `Map` key that dies with the process.
 *
 * @param options.pruneEvery How many `consume` calls between sweeps.
 */
export function createFixedWindowLimiter(
  options: { pruneEvery?: number } = {},
): FixedWindowLimiter {
  const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
  const counters = new Map<string, Counter>();
  let consumeCount = 0;

  const buildCounterKey = (
    key: string,
    window: RateLimitWindow,
    windowStartMs: number,
  ): string => {
    return `${key}|${window.windowSeconds}|${windowStartMs}`;
  };

  const startOfWindowMs = (nowMs: number, windowSeconds: number): number => {
    const windowMs = windowSeconds * 1000;
    return Math.floor(nowMs / windowMs) * windowMs;
  };

  const prune = (nowMs: number): void => {
    for (const [counterKey, counter] of counters) {
      if (counter.expiresAtMs <= nowMs) {
        counters.delete(counterKey);
      }
    }
  };

  return {
    consume: ({ key, windows, nowMs }) => {
      consumeCount += 1;
      if (consumeCount % pruneEvery === 0) {
        prune(nowMs);
      }

      // Two passes, because a refusal must consume nothing. Incrementing as we
      // go would charge the day-long window for an attempt the minute-long one
      // was always going to refuse, and the invitation resend limit would then
      // exhaust its ten a day after ten impatient clicks in one minute.
      let retryAfterSeconds = 0;
      for (const window of windows) {
        const windowStartMs = startOfWindowMs(nowMs, window.windowSeconds);
        const counter = counters.get(
          buildCounterKey(key, window, windowStartMs),
        );
        if (counter !== undefined && counter.count >= window.limit) {
          const secondsLeft = Math.ceil(
            (windowStartMs + window.windowSeconds * 1000 - nowMs) / 1000,
          );
          retryAfterSeconds = Math.max(retryAfterSeconds, secondsLeft);
        }
      }

      if (retryAfterSeconds > 0) {
        return { isAllowed: false, retryAfterSeconds };
      }

      for (const window of windows) {
        const windowStartMs = startOfWindowMs(nowMs, window.windowSeconds);
        const counterKey = buildCounterKey(key, window, windowStartMs);
        const counter = counters.get(counterKey);
        if (counter === undefined) {
          counters.set(counterKey, {
            count: 1,
            expiresAtMs: windowStartMs + window.windowSeconds * 1000,
          });
        } else {
          counter.count += 1;
        }
      }

      return { isAllowed: true, retryAfterSeconds: 0 };
    },

    reset: () => {
      counters.clear();
    },

    size: () => {
      return counters.size;
    },
  };
}
