import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/** One shell-free CLI invocation; output is delivered a complete line at a time. */
export type Command = {
  executable: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  stdin?: string;
  onOutput?: (text: string) => void;
};
/** External process boundary, injectable for offline deployment tests. */
export type Runner = (command: Command) => Promise<string>;

/** Runs a CLI without a shell; failures reveal only status, never input. */
export function runCommand(command: Command): Promise<string> {
  return new Promise((fulfill, reject) => {
    const child = _spawnCommand(command);
    let stdout = "";
    const streams = [child.stdout, child.stderr].map((stream) => {
      const decoder = new StringDecoder("utf8");
      let pending = "";
      stream.on("data", (chunk: Buffer) => {
        const text = decoder.write(chunk);
        if (stream === child.stdout) {
          stdout += text;
        }
        pending += text;
        const lines = pending.split(/(?<=\n|\r)/);
        pending = lines.pop() ?? "";
        lines.forEach((line) => {
          return command.onOutput?.(line);
        });
      });
      return () => {
        const remaining = `${pending}${decoder.end()}`;
        if (remaining !== "") {
          command.onOutput?.(remaining);
        }
      };
    });
    child.on("error", () => {
      return reject(new Error("CLI unavailable"));
    });
    child.on("close", (code) => {
      streams.forEach((flush) => {
        return flush();
      });
      if (code !== 0) {
        reject(new Error(`CLI exited with status ${code ?? "signal"}`));
      } else {
        fulfill(stdout);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(command.stdin ?? "");
  });
}

/** Creates a shell-free child with an explicit environment and piped input. */
function _spawnCommand(command: Command): ChildProcessWithoutNullStreams {
  return spawn(command.executable, [...command.args], {
    cwd: command.cwd,
    env: { ...process.env, ...command.env },
    stdio: "pipe",
  });
}
