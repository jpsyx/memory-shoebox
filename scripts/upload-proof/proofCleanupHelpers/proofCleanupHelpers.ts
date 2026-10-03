/** Inputs for installProofSignalHandlers. */
type InstallProofSignalHandlersOptions = {
  cleanup: ProofCleanup;
  signalSource: SignalSource;
  exit: (code: number) => void;
  writeLine: (text: string) => void;
  now?: () => number;
};
/*
 * What `pnpm upload:proof` must undo however it ends: the browser it launched
 * and the session row it minted. An ordinary end and an error both reach a
 * `finally`, but a Ctrl-C does not: Node exits on SIGINT before a `finally`
 * can run, so a session would stay in the catalog until it expired. The
 * script therefore keeps its undoing in one place, which its `finally` and a
 * signal handler both run.
 */

/** One thing to undo. */
type CleanupStep = () => Promise<void> | void;

/** The things to undo, and the one run that undoes them. */
export type ProofCleanup = {
  /** Registers a step. Steps run last in, first out. */
  add: (step: CleanupStep) => void;
  /**
   * Runs every step, once, however many callers ask: later callers get the
   * same run, so a signal that arrives while the script is already ending
   * waits for it instead of repeating it. Never rejects. Resolves with the
   * message of every step that threw, so one failure never stops the rest.
   */
  run: () => Promise<string[]>;
};

/** An empty list of things to undo. */
export function createProofCleanup(): ProofCleanup {
  const steps: CleanupStep[] = [];
  let ongoingRun: Promise<string[]> | undefined = undefined;

  // Last in, first out: the browser is closed before the session it was
  // signed in with is deleted. One step at a time, each after the one before
  // has settled, and each failure kept rather than thrown.
  const runSteps = (): Promise<string[]> => {
    return [...steps].reverse().reduce(async (failuresSoFar, step) => {
      const failures = await failuresSoFar;
      try {
        await step();
      } catch (error: unknown) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      return failures;
    }, Promise.resolve<string[]>([]));
  };

  return {
    add: (step) => {
      steps.push(step);
    },
    run: () => {
      ongoingRun ??= runSteps();
      return ongoingRun;
    },
  };
}

/** The signals that end a run from outside. */
const PROOF_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/** One of those signals. */
type ProofSignal = (typeof PROOF_SIGNALS)[number];

/** The exit code each means: 128 plus its number, as a shell reports it. */
const SIGNAL_EXIT_CODES: Readonly<Record<ProofSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

/** Where signals come from: `process`, or a stand-in for it in a test. */
type SignalSource = {
  on: (signal: ProofSignal, listener: () => void) => unknown;
  off: (signal: ProofSignal, listener: () => void) => unknown;
};

/**
 * How long after the first signal another counts as the same one. `tsx` runs
 * this script in a child process and relays the signals it receives, so one
 * Ctrl-C reaches the child twice, a few milliseconds apart.
 */
const SAME_SIGNAL_WINDOW_MS = 1000;

/**
 * Makes a signal run the cleanup and then exit non-zero (128 plus the signal's
 * number, as a shell reports it).
 *
 * The browser is launched with Playwright's own signal handling turned off,
 * because Playwright's exits the process and nothing after it runs. A second,
 * deliberate signal while the cleanup is still going exits at once: somebody
 * pressing Ctrl-C twice means it, and a browser that will not close must not
 * trap them. A repeat within a second is not that, but the same signal
 * arriving twice (see `SAME_SIGNAL_WINDOW_MS`), and is ignored.
 *
 * @param options.signalSource `process` in the script.
 * @param options.exit Ends the process in the script.
 * @param options.writeLine Prints one line to the terminal.
 * @param options.now The clock in milliseconds. Defaults to `Date.now`.
 * @returns A function that removes the handlers.
 */
export function installProofSignalHandlers(
  options: Readonly<InstallProofSignalHandlersOptions>,
): () => void {
  const { cleanup, exit, signalSource, writeLine } = options;
  const { now = Date.now } = options;

  let firstSignalAt: number | undefined = undefined;
  const listeners = PROOF_SIGNALS.map((signal) => {
    const listener = (): void => {
      const code = SIGNAL_EXIT_CODES[signal];
      if (firstSignalAt !== undefined) {
        if (now() - firstSignalAt >= SAME_SIGNAL_WINDOW_MS) {
          exit(code);
        }
        return;
      }
      firstSignalAt = now();
      writeLine(
        `Interrupted (${signal}): closing the browser and ending the session.`,
      );
      void cleanup.run().then(() => {
        exit(code);
      });
    };
    signalSource.on(signal, listener);
    return { signal, listener };
  });
  return () => {
    listeners.forEach(({ listener, signal }) => {
      signalSource.off(signal, listener);
    });
  };
}
