import { spawn } from "node:child_process";
import { constants } from "node:os";

/** A CLI attached to the caller's terminal with an authoritative environment. */
export type AttachedCommand = {
  executable: string;
  args: readonly string[];
  env: Readonly<NodeJS.ProcessEnv>;
};

/** Injectable process boundary for production command tests. */
export type AttachedRunner = (command: AttachedCommand) => Promise<number>;

/** Preserves terminal input/output and exit status without invoking a shell. */
export function runAttachedCommand(
  command: Readonly<AttachedCommand>,
): Promise<number> {
  return new Promise((fulfill, reject) => {
    const child = spawn(command.executable, [...command.args], {
      env: command.env,
      stdio: "inherit",
    });
    // Wait for the child after cancellation so the caller's finally can run.
    const onInterrupt = () => {
      child.kill("SIGINT");
    };
    const onTerminate = () => {
      child.kill("SIGTERM");
    };
    const removeSignalListeners = () => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
    };
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    child.on("error", () => {
      removeSignalListeners();
      reject(
        new Error(
          `${command.executable} is unavailable; install it and add it to PATH.`,
        ),
      );
    });
    child.on("close", (code, signal) => {
      removeSignalListeners();
      fulfill(code ?? (signal ? 128 + constants.signals[signal] : 1));
    });
  });
}
