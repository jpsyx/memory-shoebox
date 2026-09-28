/**
 * How many sends a second the provider is asked for.
 *
 * Resend allows two. Asking for 1.7 leaves slack for a clock that disagrees
 * with theirs and for a retry that arrives beside a fresh send.
 */
const SENDS_PER_SECOND = 1.7;

/** The gap the in-memory window keeps between one send and the next. */
const MINIMUM_SEND_GAP_MS = Math.ceil(1000 / SENDS_PER_SECOND);

/** How long to wait when Upstash refuses without saying when to return. */
const UNKNOWN_RESET_WAIT_MS = 500;

/**
 * The floor under every wait Upstash asks for.
 *
 * A `reset` that has already passed would otherwise mean no wait at all, and
 * the retry loop would ask again as fast as the network answers.
 */
const MINIMUM_RETRY_WAIT_MS = 100;

/**
 * The ceiling over every wait Upstash asks for.
 *
 * `reset` is a wall-clock timestamp from their side, so a local clock running
 * behind theirs turns it into a wait of hours. The window is one second; a
 * longer gap than this is two clocks disagreeing, not a real wait.
 */
const MAXIMUM_RETRY_WAIT_MS = 2_000;

/**
 * How long one `acquire` waits on Upstash before it goes ahead regardless.
 *
 * Refusals lasting this long mean the shared budget is not recovering, and
 * parking a queue worker on one message forever is worse than sending it:
 * Resend's own 429 is the backstop, and the worker treats that as a reason to
 * wait rather than as a failed attempt.
 */
const MAXIMUM_TOTAL_WAIT_MS = 30_000;

/**
 * The key the shared window is counted under.
 *
 * One budget for the whole instance, because the limit belongs to the Resend
 * API key rather than to a recipient or a message kind.
 */
const SHARED_BUDGET_KEY = "global";

/** Upstash's credentials, when the instance has them. */
export type UpstashCredentials = {
  restUrl: string;
  restToken: string;
};

/** Waits for a slot before a message is handed to the provider. */
export type SendRateLimiter = {
  /** Resolves when the caller may send. Never rejects. */
  acquire: () => Promise<void>;
  /** Which store is enforcing the window, for the health surface. */
  readonly kind: "upstash" | "memory";
};

/** The slice of Upstash's limiter this uses, so a test can stand in for it. */
export type UpstashLimitApi = {
  limit: (identifier: string) => Promise<{ success: boolean; reset: number }>;
};

/** Timing, injectable so a test needs no real clock and no real waiting. */
type LimiterTime = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

/**
 * The window held in this process.
 *
 * It reserves the next slot as it hands one out, so concurrent callers queue
 * behind each other rather than all reading the same "now" and agreeing they
 * may go. A single Fly machine running one queue worker is the case this
 * handles exactly, and it is the case almost every self-hosted install is in.
 */
function _createMemoryRateLimiter(time: LimiterTime): SendRateLimiter {
  let nextSlotAtMs = 0;

  return {
    kind: "memory",
    acquire: async () => {
      const nowMs = time.now();
      const waitMs = Math.max(nextSlotAtMs - nowMs, 0);
      nextSlotAtMs = Math.max(nextSlotAtMs, nowMs) + MINIMUM_SEND_GAP_MS;
      if (waitMs > 0) {
        await time.sleep(waitMs);
      }
    },
  };
}

/**
 * Loads the Upstash client and builds the shared window on top of it.
 *
 * Imported lazily so an instance with no Upstash never loads the client at
 * all, which is what lets the dependency sit in `dependencies` without
 * costing a boot that will never use it.
 */
async function _loadUpstashLimiter(
  credentials: UpstashCredentials,
): Promise<UpstashLimitApi> {
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import("@upstash/ratelimit"),
    import("@upstash/redis"),
  ]);

  return new Ratelimit({
    redis: new Redis({
      url: credentials.restUrl,
      token: credentials.restToken,
    }),
    limiter: Ratelimit.slidingWindow(SENDS_PER_SECOND, "1 s"),
    // Namespaced because two deployments may share one API key, and so one
    // budget.
    prefix: "memory-shoebox:resend",
  });
}

/**
 * Turns a refusal into how long to wait before asking again.
 *
 * `reset` says when the next token appears, so the wait is exact rather than
 * a guess. It is clamped at both ends: the floor stops the loop spinning on a
 * reset that has already passed, and the ceiling stops a disagreeing clock
 * turning one refusal into a wait nobody asked for.
 */
function _waitMsAfterRefusal(resetAtMs: number, nowMs: number): number {
  if (!Number.isFinite(resetAtMs)) {
    return UNKNOWN_RESET_WAIT_MS;
  }

  return Math.min(
    Math.max(resetAtMs - nowMs, MINIMUM_RETRY_WAIT_MS),
    MAXIMUM_RETRY_WAIT_MS,
  );
}

/**
 * The window held in Upstash, shared by everything using the same API key.
 *
 * The limit belongs to the key rather than to the process, so a script run
 * beside the server draws on the same budget. That is the whole reason this
 * option exists; the in-memory window cannot see it.
 *
 * It waits for a slot rather than refusing, because the caller is a queue
 * worker with a message in hand and nowhere else to put it. If Upstash cannot
 * be reached at all, the wait falls back to this process's own window: a
 * shared budget that is unreachable is still better spaced than not spaced.
 */
function _createUpstashRateLimiter(options: {
  credentials: UpstashCredentials;
  time: LimiterTime;
  limitApi: UpstashLimitApi | undefined;
}): SendRateLimiter {
  const { credentials, time, limitApi } = options;
  const inProcessWindow = _createMemoryRateLimiter(time);
  let limitApiPromise: Promise<UpstashLimitApi> | undefined;

  return {
    kind: "upstash",
    acquire: async () => {
      const deadlineMs = time.now() + MAXIMUM_TOTAL_WAIT_MS;
      try {
        limitApiPromise ??=
          limitApi === undefined
            ? _loadUpstashLimiter(credentials)
            : Promise.resolve(limitApi);
        const upstash = await limitApiPromise;
        // Loops rather than returning a refusal, and passes straight through
        // when nothing is limiting. Every turn of it sleeps, so it cannot
        // become a busy wait, and the deadline bounds it.
        while (time.now() < deadlineMs) {
          const { success, reset } = await upstash.limit(SHARED_BUDGET_KEY);
          if (success) {
            return;
          }
          await time.sleep(_waitMsAfterRefusal(reset, time.now()));
        }
      } catch {
        // Cleared so the next send tries Upstash again rather than inheriting
        // one bad load forever.
        limitApiPromise = undefined;
        await inProcessWindow.acquire();
      }
    },
  };
}

/**
 * Builds the limiter every send passes through.
 *
 * **Upstash when it is configured, and the same window in memory when it is
 * not.** Avandar's equivalent throws when the Upstash variables are missing;
 * this one cannot, because `docs/architecture.md` requires an instance to boot
 * and serve with no mail configured at all. Both branches are real limiting:
 * the difference is whether the budget is shared outside this process.
 *
 * @param options.upstash The credentials, or undefined.
 * @param options.now Overridable so a test needs no real clock.
 * @param options.sleep Overridable so a test needs no real waiting.
 * @param options.upstashLimitApi Overridable so a test never reaches Upstash.
 */
/** What the limiter needs, and the three seams tests reach it through. */
export type SendRateLimiterOptions = {
  /** Shared credentials, or `undefined` for the window this process holds. */
  upstash: UpstashCredentials | undefined;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  upstashLimitApi?: UpstashLimitApi;
};

export function createSendRateLimiter(
  options: SendRateLimiterOptions,
): SendRateLimiter {
  const time: LimiterTime = {
    now:
      options.now ??
      (() => {
        return Date.now();
      }),
    sleep:
      options.sleep ??
      ((milliseconds) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve();
          }, milliseconds);
        });
      }),
  };

  return options.upstash === undefined
    ? _createMemoryRateLimiter(time)
    : _createUpstashRateLimiter({
        credentials: options.upstash,
        time,
        limitApi: options.upstashLimitApi,
      });
}
