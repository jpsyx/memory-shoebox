import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appConfig } from "../../../../../app.config.ts";
import type { MediaChildOptions } from "./mediaRuntime.types.ts";
import type { MediaCgroup } from "./mediaCgroup.ts";

const LIMITS = appConfig.mediaProcessing;
type ChildContext = {
  group: MediaCgroup;
  scratchPath: string;
  checkDisk: () => Promise<void>;
  clock: () => number;
};
type ChildState = {
  stdout: Buffer[];
  stdoutBytes: number;
  stderr: Buffer;
  failure: string | undefined;
  kill: Promise<void> | undefined;
  child: ChildProcessWithoutNullStreams;
};

function _stopChild(
  state: ChildState,
  group: Readonly<MediaCgroup>,
  reason?: string,
): void {
  state.failure ??= reason;
  state.child.kill("SIGKILL");
  state.kill ??= group.kill().catch(() => {
    state.failure = "processing_group_shutdown_failed";
  });
}

function _watchOutput(
  child: ChildProcessWithoutNullStreams,
  state: ChildState,
  options: Readonly<MediaChildOptions>,
  group: Readonly<MediaCgroup>,
): void {
  child.stdout.on("data", (chunk: Buffer) => {
    state.stdoutBytes += chunk.length;
    if (state.stdoutBytes > options.stdoutLimitBytes) {
      _stopChild(state, group, "processing_stdout_limit");
    } else {
      state.stdout.push(chunk);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    // Strip whole non-whitespace tokens: split URLs cannot leak credentials.
    const sanitized = chunk.toString().replace(/\S+/g, "[redacted]");
    state.stderr = Buffer.concat([
      state.stderr,
      Buffer.from(sanitized),
    ]).subarray(-LIMITS.stderrBytes);
  });
}

function _spawnInGroup(
  options: Readonly<MediaChildOptions>,
  context: Readonly<ChildContext>,
): ChildProcessWithoutNullStreams {
  // Shell builtins join before exec loads Node, FFmpeg or libheif code.
  return spawn(
    "/bin/sh",
    [
      "-ec",
      `printf "%s" "$$" > "$1/cgroup.procs"; shift; exec prlimit --fsize=${LIMITS.outputBytes}:${LIMITS.outputBytes} -- "$@"`,
      "media-launcher",
      context.group.path,
      options.executable,
      ...options.args,
    ],
    {
      cwd: context.scratchPath,
      env: {
        PATH: process.env["PATH"],
        TMPDIR: context.scratchPath,
        HOME: context.scratchPath,
        OMP_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        VIPS_CONCURRENCY: "1",
        UV_THREADPOOL_SIZE: "1",
      },
      stdio: "pipe",
    },
  );
}

function _monitor(
  state: ChildState,
  options: Readonly<MediaChildOptions>,
  context: Readonly<ChildContext>,
): () => Promise<void> {
  const deadline = context.clock() + options.timeoutMs;
  const timer = setTimeout(() => {
    return _stopChild(state, context.group, "processing_timeout");
  }, options.timeoutMs);
  let diskCheck: Promise<void> | undefined;
  const monitor = setInterval(() => {
    if (context.clock() >= deadline) {
      _stopChild(state, context.group, "processing_timeout");
    }
    if (diskCheck !== undefined) {
      return;
    }
    diskCheck = context
      .checkDisk()
      .catch(() => {
        return _stopChild(state, context.group, "processing_disk_limit");
      })
      .finally(() => {
        diskCheck = undefined;
      });
  }, LIMITS.diskPollMs);
  return async () => {
    clearTimeout(timer);
    clearInterval(monitor);
    await diskCheck;
  };
}

function _waitForChildExit(
  state: ChildState,
  group: Readonly<MediaCgroup>,
): Promise<number> {
  const child = state.child;
  return new Promise<number>((resolve) => {
    child.on("error", () => {
      _stopChild(state, group, "processing_child_failed");
      resolve(-1);
    });
    child.on("exit", () => {
      return _stopChild(state, group);
    });
    child.on("close", (code) => {
      return resolve(code ?? -1);
    });
  });
}

/** Runs a bounded child; all descendants are killed before command settlement. */
export async function runMediaChild(
  options: Readonly<MediaChildOptions>,
  context: Readonly<ChildContext>,
): Promise<{ stdout: string; exitCode: number }> {
  const beforeOomKills = await context.group.getOomKills();
  const child = _spawnInGroup(options, context);
  const state: ChildState = {
    stdout: [],
    stdoutBytes: 0,
    stderr: Buffer.alloc(0),
    failure: undefined,
    kill: undefined,
    child,
  };
  const onAbort = () => {
    return _stopChild(state, context.group, "processing_cancelled");
  };
  _watchOutput(child, state, options, context.group);
  child.stdin.end();
  options.signal.addEventListener("abort", onAbort, { once: true });
  if (options.signal.aborted) {
    onAbort();
  }
  const stopMonitor = _monitor(state, options, context);
  const exitCode = await _waitForChildExit(state, context.group);
  await stopMonitor();
  options.signal.removeEventListener("abort", onAbort);
  await state.kill;
  if ((await context.group.getOomKills()) > beforeOomKills) {
    throw new Error("processing_memory_limit");
  }
  if (state.failure !== undefined) {
    throw new Error(state.failure);
  }
  await context.checkDisk();
  return { stdout: Buffer.concat(state.stdout).toString("utf8"), exitCode };
}
