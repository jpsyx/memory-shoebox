import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobRunner, type Job } from "../../src/jobs/createJobRunner.ts";

const silentLogger = {
  info: () => {
    return undefined;
  },
  error: () => {
    return undefined;
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createJobRunner", () => {
  it("runs a job on its cadence and not before", async () => {
    let runCount = 0;
    const job: Job = {
      name: "counter",
      intervalMs: 60_000,
      run: () => {
        runCount += 1;
        return Promise.resolve();
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    expect(runCount).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runCount).toBe(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(runCount).toBe(3);

    await runner.stop();
  });

  it("never runs a job while its previous run is still going", async () => {
    let started = 0;
    let release: (() => void) | undefined;
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(started).toBe(1);
    release?.();
    await runner.stop();
  });

  it("ignores a second start, so stop clears every interval", async () => {
    let runCount = 0;
    const job: Job = {
      name: "counter",
      intervalMs: 60_000,
      run: () => {
        runCount += 1;
        return Promise.resolve();
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    runner.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runCount).toBe(1);

    await runner.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(runCount).toBe(1);
  });

  it("refuses to run a job once it has stopped", async () => {
    let runCount = 0;
    const runner = createJobRunner({
      jobs: [
        {
          name: "counter",
          intervalMs: 60_000,
          run: () => {
            runCount += 1;
            return Promise.resolve();
          },
        },
      ],
      logger: silentLogger,
    });

    runner.start();
    await runner.stop();

    await expect(runner.runOnce("counter")).rejects.toThrow(/stopped/);
    expect(runCount).toBe(0);
  });

  it("logs a failure and keeps the schedule", async () => {
    const errors: unknown[] = [];
    let runCount = 0;
    const job: Job = {
      name: "flaky",
      intervalMs: 1000,
      run: () => {
        runCount += 1;
        return runCount === 1
          ? Promise.reject(new Error("no"))
          : Promise.resolve();
      },
    };
    const runner = createJobRunner({
      jobs: [job],
      logger: {
        info: () => {
          return undefined;
        },
        error: (details) => {
          errors.push(details);
        },
      },
    });

    runner.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(errors).toHaveLength(1);
    expect(runCount).toBe(2);
    await runner.stop();
  });

  it("stops the schedule and waits for what is in flight", async () => {
    let finished = false;
    let release: (() => void) | undefined;
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: () => {
        return new Promise<void>((resolve) => {
          release = () => {
            finished = true;
            resolve();
          };
        });
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    await vi.advanceTimersByTimeAsync(1000);

    // Resolution order is the only honest evidence that `stop()` waits: a
    // `release?.()` right after the call would leave `finished` true whether
    // or not anything was awaited.
    let stopResolved = false;
    const stopped = runner.stop().then(() => {
      stopResolved = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopResolved).toBe(false);

    release?.();
    await stopped;

    expect(finished).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it("waits for a run in flight instead of resolving having done nothing", async () => {
    let started = 0;
    let finished = false;
    let release: (() => void) | undefined;
    const job: Job = {
      name: "slow",
      intervalMs: 1000,
      run: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          release = () => {
            finished = true;
            resolve();
          };
        });
      },
    };
    const runner = createJobRunner({ jobs: [job], logger: silentLogger });

    runner.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(1);

    let onceResolved = false;
    const once = runner.runOnce("slow").then(() => {
      onceResolved = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onceResolved).toBe(false);

    release?.();
    await once;

    expect(finished).toBe(true);
    expect(started).toBe(1);
    await runner.stop();
  });

  it("runs one job by name, for a test or an operator", async () => {
    let runCount = 0;
    const runner = createJobRunner({
      jobs: [
        {
          name: "counter",
          intervalMs: 60_000,
          run: () => {
            runCount += 1;
            return Promise.resolve();
          },
        },
      ],
      logger: silentLogger,
    });

    await runner.runOnce("counter");

    expect(runCount).toBe(1);
  });
});
