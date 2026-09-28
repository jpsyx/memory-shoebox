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
  start: () => void;
  /** Clears the schedule and waits for anything still running. */
  stop: () => Promise<void>;
  /** Runs one job now, by name. Tests and a future operator command. */
  runOnce: (name: string) => Promise<void>;
};

/**
 * Builds the background job runner.
 *
 * A plain interval in the Fastify process is enough for a single-machine Fly
 * deployment (`data-models.md` § There is no job runner yet), and what that
 * section actually asks for is the part that is easy to skip: it "has to exist
 * and shut down cleanly on `SIGTERM` alongside the database".
 *
 * Three properties the jobs themselves rely on:
 *
 * - **No overlap.** A run that is still going when the next tick arrives skips
 *   that tick. SQLite has one writer, and a slow sweep queueing behind itself
 *   is how a hung job becomes a hung database.
 * - **A failure is logged and the schedule survives.** A job that threw on one
 *   tick runs again on the next. Every job here is idempotent, so retrying is
 *   free.
 * - **Nothing runs at `start()`.** The first run of each job is one interval
 *   later, which keeps boot fast and makes a test that advances a clock by a
 *   known amount say exactly what it means.
 */
export function createJobRunner(options: {
  jobs: readonly Job[];
  logger: JobLogger;
}): JobRunner {
  const timers = new Map<string, NodeJS.Timeout>();
  const inFlight = new Map<string, Promise<void>>();

  const runJob = async (job: Job): Promise<void> => {
    if (inFlight.has(job.name)) {
      return;
    }
    const started = Date.now();
    // `job.run()` goes inside the `then` so that a job which throws
    // synchronously lands in the same `catch` as one that rejects: either way
    // it is a logged failure, not an unhandled rejection.
    const promise = Promise.resolve()
      .then(() => {
        return job.run();
      })
      .then(() => {
        options.logger.info(
          { job: job.name, durationMs: Date.now() - started },
          "job finished",
        );
      })
      .catch((error: unknown) => {
        options.logger.error({ job: job.name, err: error }, "job failed");
      })
      .finally(() => {
        inFlight.delete(job.name);
      });
    // Set before the first `await`, and in the same synchronous step as the
    // guard above, so there is no window in which two runs both see it empty.
    inFlight.set(job.name, promise);
    await promise;
  };

  return {
    start: () => {
      for (const job of options.jobs) {
        const timer = setInterval(() => {
          void runJob(job);
        }, job.intervalMs);
        // Unref so an interval never holds the process open on its own: the
        // HTTP server decides how long the process lives, not the sweeps.
        timer.unref();
        timers.set(job.name, timer);
      }
    },

    stop: async () => {
      for (const timer of timers.values()) {
        clearInterval(timer);
      }
      timers.clear();
      await Promise.allSettled([...inFlight.values()]);
    },

    runOnce: async (name) => {
      const job = options.jobs.find((candidate) => {
        return candidate.name === name;
      });
      if (job === undefined) {
        throw new Error(`No job named ${name}`);
      }
      await runJob(job);
    },
  };
}
