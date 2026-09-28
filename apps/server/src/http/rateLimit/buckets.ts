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

/** One `consume` call's arguments, and the store its two passes share. */
type WindowPass = {
  counters: Map<string, Counter>;
  key: string;
  windows: readonly RateLimitWindow[];
  nowMs: number;
};

/** Where one key's counter for a window and a window start is filed. */
function _buildCounterKey(options: {
  key: string;
  window: RateLimitWindow;
  windowStartMs: number;
}): string {
  const { key, window, windowStartMs } = options;
  return `${key}|${window.windowSeconds}|${windowStartMs}`;
}

/** The instant the fixed window holding `nowMs` opened. */
function _startOfWindowMs(options: {
  nowMs: number;
  windowSeconds: number;
}): number {
  const windowMs = options.windowSeconds * 1000;
  return Math.floor(options.nowMs / windowMs) * windowMs;
}

/** Drops every counter whose window has already turned over. */
function _pruneExpired(options: {
  counters: Map<string, Counter>;
  nowMs: number;
}): void {
  for (const [counterKey, counter] of options.counters) {
    if (counter.expiresAtMs <= options.nowMs) {
      options.counters.delete(counterKey);
    }
  }
}

/**
 * Seconds until the fullest full window turns over, or zero when every
 * window still has room.
 *
 * Reads and never writes. That is the whole point of the split: every window
 * answers before any of them is charged, so a refusal by one costs nothing
 * in the others.
 */
function _refusalSeconds(options: WindowPass): number {
  const { counters, key, windows, nowMs } = options;
  let retryAfterSeconds = 0;
  for (const window of windows) {
    const windowStartMs = _startOfWindowMs({
      nowMs,
      windowSeconds: window.windowSeconds,
    });
    // The count is read before the comparison rather than inside it, so that
    // a window of zero refuses its first request too: asking whether a
    // counter exists first would let that one through.
    const count =
      counters.get(_buildCounterKey({ key, window, windowStartMs }))?.count ??
      0;
    if (count >= window.limit) {
      const secondsLeft = Math.ceil(
        (windowStartMs + window.windowSeconds * 1000 - nowMs) / 1000,
      );
      retryAfterSeconds = Math.max(retryAfterSeconds, secondsLeft);
    }
  }
  return retryAfterSeconds;
}

/** Adds one to every window, opening the counters that are not there yet. */
function _chargeEveryWindow(options: WindowPass): void {
  const { counters, key, windows, nowMs } = options;
  for (const window of windows) {
    const windowStartMs = _startOfWindowMs({
      nowMs,
      windowSeconds: window.windowSeconds,
    });
    const counterKey = _buildCounterKey({ key, window, windowStartMs });
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
}

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

  return {
    consume: ({ key, windows, nowMs }) => {
      consumeCount += 1;
      if (consumeCount % pruneEvery === 0) {
        _pruneExpired({ counters, nowMs });
      }

      // Two passes, because a refusal must consume nothing. Incrementing as we
      // go would charge the day-long window for an attempt the minute-long one
      // was always going to refuse, and the invitation resend limit would then
      // exhaust its ten a day after ten impatient clicks in one minute.
      const retryAfterSeconds = _refusalSeconds({
        counters,
        key,
        windows,
        nowMs,
      });
      if (retryAfterSeconds > 0) {
        return { isAllowed: false, retryAfterSeconds };
      }

      _chargeEveryWindow({ counters, key, windows, nowMs });
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
