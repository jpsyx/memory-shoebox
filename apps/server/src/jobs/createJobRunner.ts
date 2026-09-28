/** One scheduled piece of background work. */
export type Job = {
  /** The name `conventions.md` § The job runner gives it, kebab-case. */
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

/** Just enough of a logger for the runner. Fastify's satisfies it. */
export type JobLogger = {
  info: (details: Record<string, unknown>, message: string) => void;
  error: (details: Record<string, unknown>, message: string) => void;
};

/** The scheduler. One per process, owned by `createApp`. */
export type JobRunner = {
  /**
   * Puts every job on its interval. Starting a started runner does nothing.
   */
  start: () => void;
  /**
   * Clears the schedule and waits for anything still running. Terminal: after
   * it, `start` does nothing and `runOnce` throws.
   */
  stop: () => Promise<void>;
  /**
   * Runs one job now, by name, and resolves once it has actually run: a run
   * already in flight is awaited, not skipped. Throws for a name no job has,
   * and once the runner has stopped. Tests and a future operator command.
   */
  runOnce: (name: string) => Promise<void>;
};

/**
 * Starts one run of `job` and records it in `inFlight` until it settles.
 *
 * It starts a run unconditionally, because the caller owns the overlap
 * decision: an interval tick skips a run already going, `runOnce` waits for
 * it. The promise never rejects, so a job that failed is a log line and not a
 * dead schedule.
 */
function _startJobRun(options: {
  job: Job;
  logger: JobLogger;
  inFlight: Map<string, Promise<void>>;
}): Promise<void> {
  const { job, logger, inFlight } = options;
  const started = Date.now();
  // `job.run()` goes inside the `then` so that a job which throws
  // synchronously lands in the same `catch` as one that rejects: either way
  // it is a logged failure, not an unhandled rejection.
  const promise = Promise.resolve()
    .then(() => {
      return job.run();
    })
    .then(() => {
      logger.info(
        { job: job.name, durationMs: Date.now() - started },
        "job finished",
      );
    })
    .catch((error: unknown) => {
      logger.error({ job: job.name, err: error }, "job failed");
    })
    .finally(() => {
      inFlight.delete(job.name);
    });
  // Set in the same synchronous step as the caller's guard, so there is no
  // window in which two runs both see it empty.
  inFlight.set(job.name, promise);
  return promise;
}

/** Puts `job` on its interval, where a tick during a run skips that tick. */
function _scheduleJob(options: {
  job: Job;
  logger: JobLogger;
  inFlight: Map<string, Promise<void>>;
}): NodeJS.Timeout {
  const { job, logger, inFlight } = options;
  const timer = setInterval(() => {
    if (inFlight.has(job.name)) {
      return;
    }
    void _startJobRun({ job, logger, inFlight });
  }, job.intervalMs);
  // Unref so an interval never holds the process open on its own: the HTTP
  // server decides how long the process lives, not the sweeps.
  timer.unref();
  return timer;
}

/**
 * Runs `job` now, or waits for the run already in flight.
 *
 * Waiting is the whole difference from an interval tick. A caller that asked
 * for the job to have run is owed a run, and resolving on the overlap guard
 * would report work that had not even started.
 */
async function _runJobOnce(options: {
  job: Job;
  logger: JobLogger;
  inFlight: Map<string, Promise<void>>;
}): Promise<void> {
  const existing = options.inFlight.get(options.job.name);
  if (existing !== undefined) {
    await existing;
    return;
  }
  await _startJobRun(options);
}

/**
 * Builds the background job runner.
 *
 * A plain interval in the Fastify process is enough for a single-machine Fly
 * deployment (`data-models.md` § There is no job runner yet), and what that
 * section actually asks for is the part that is easy to skip: it "has to exist
 * and shut down cleanly on `SIGTERM` alongside the database".
 *
 * Four properties the jobs themselves rely on:
 *
 * - **No overlap.** A run that is still going when the next tick arrives skips
 *   that tick. SQLite has one writer, and a slow sweep queueing behind itself
 *   is how a hung job becomes a hung database. `runOnce` is the one exception
 *   to the skip: it waits for the run in flight, because its caller asked for
 *   the job to have run and silence would say it had.
 * - **A failure is logged and the schedule survives.** A job that threw on one
 *   tick runs again on the next. Every job here is idempotent, so retrying is
 *   free.
 * - **Nothing runs at `start()`.** The first run of each job is one interval
 *   later, which keeps boot fast and makes a test that advances a clock by a
 *   known amount say exactly what it means.
 * - **One lifecycle, one direction:** `idle` -> `running` -> `stopped`. A
 *   second `start()` is ignored rather than scheduling a second interval per
 *   job, which would leak the timer it replaced past a `stop()` that can no
 *   longer reach it. `stop()` is terminal, and `runOnce` throws after it: the
 *   `onClose` hook that owns shutdown closes the SQLite handle as soon as
 *   `stop()` resolves, so a job entering that window queries a database that
 *   is closing underneath it.
 */
export function createJobRunner(options: {
  jobs: readonly Job[];
  logger: JobLogger;
}): JobRunner {
  const timers = new Map<string, NodeJS.Timeout>();
  const inFlight = new Map<string, Promise<void>>();
  let state: "idle" | "running" | "stopped" = "idle";

  return {
    start: () => {
      if (state !== "idle") {
        return;
      }
      state = "running";
      options.jobs.forEach((job) => {
        const timer = _scheduleJob({ job, logger: options.logger, inFlight });
        timers.set(job.name, timer);
      });
    },

    stop: async () => {
      state = "stopped";
      // Not `timers.forEach(clearInterval)`: `Map.forEach` passes three
      // arguments, and `clearInterval` would be handed the key as well.
      timers.forEach((timer) => {
        clearInterval(timer);
      });
      timers.clear();
      await Promise.allSettled([...inFlight.values()]);
    },

    runOnce: async (name) => {
      if (state === "stopped") {
        throw new Error(`The job runner has stopped; ${name} did not run`);
      }
      const job = options.jobs.find((candidate) => {
        return candidate.name === name;
      });
      if (job === undefined) {
        throw new Error(`No job named ${name}`);
      }
      await _runJobOnce({ job, logger: options.logger, inFlight });
    },
  };
}
