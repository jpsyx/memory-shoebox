import { randomUUID as randomUuid } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rm, statfs } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { APP_CONFIG } from "../../../../../app.config.ts";
import {
  createMediaCgroup,
  type MediaCgroup,
} from "./createMediaCgroup/createMediaCgroup.ts";
import type { MediaChildOptions } from "./mediaRuntime.types.ts";
import { runMediaChild } from "./runMediaChild.ts";
type MediaCommandRunOptions = {
  options: Readonly<MediaChildOptions>;
  state: RunnerState;
  config: Readonly<RunnerOptions>;
  scratchPath: string;
};

const LIMITS = APP_CONFIG.mediaProcessing;
type RunnerOptions = {
  cgroupRoot: string;
  scratchRoot: string;
  clock: () => number;
};
type RunnerState = {
  group: MediaCgroup | undefined;
  initialization: Promise<void> | undefined;
  active: Promise<{ stdout: string; exitCode: number }> | undefined;
  disposed: boolean;
  ownedScratch: boolean;
  shutdown: AbortController;
};

async function _getDirectoryBytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name);
      const metadata = await lstat(entryPath);
      if (
        metadata.isSymbolicLink() ||
        (!metadata.isDirectory() && !metadata.isFile())
      ) {
        throw new Error("processing_disk_limit");
      }
      return metadata.isDirectory()
        ? _getDirectoryBytes(entryPath)
        : metadata.size;
    }),
  );
  return sizes.reduce((sum, size) => {
    return sum + size;
  }, 0);
}

async function _checkDisk(scratchPath: string): Promise<void> {
  const [scratchBytes, outputBytes, filesystem] = await Promise.all([
    _getDirectoryBytes(scratchPath),
    _getDirectoryBytes(join(scratchPath, "output")),
    statfs(scratchPath),
  ]);
  if (
    scratchBytes > LIMITS.scratchBytes ||
    outputBytes > LIMITS.outputBytes ||
    filesystem.bavail * filesystem.bsize < LIMITS.freeSpaceReserveBytes
  ) {
    throw new Error("processing_disk_limit");
  }
}

async function _initialize({
  state,
  options,
  scratchPath,
}: {
  state: RunnerState;
  options: Readonly<RunnerOptions>;
  scratchPath: string;
}): Promise<void> {
  state.group = await createMediaCgroup(options.cgroupRoot);
  try {
    if (!isAbsolute(options.scratchRoot)) {
      throw new Error("processing_scratch_unavailable");
    }
    await mkdir(options.scratchRoot, { recursive: true, mode: 0o700 });
    if ((await realpath(options.scratchRoot)) !== options.scratchRoot) {
      throw new Error("processing_scratch_unavailable");
    }
    const filesystem = await statfs(options.scratchRoot);
    if (
      filesystem.bavail * filesystem.bsize <
      LIMITS.scratchBytes + LIMITS.freeSpaceReserveBytes
    ) {
      throw new Error("processing_disk_limit");
    }
    await mkdir(scratchPath, { mode: 0o700 });
    state.ownedScratch = true;
    await mkdir(join(scratchPath, "output"), { mode: 0o700 });
  } catch {
    await state.group.dispose();
    state.group = undefined;
    throw new Error("processing_scratch_unavailable");
  }
}

async function _run({
  options,
  state,
  config,
  scratchPath,
}: MediaCommandRunOptions): Promise<{ stdout: string; exitCode: number }> {
  if (state.disposed) {
    throw new Error("processing_disposed");
  }
  if (options.signal.aborted) {
    throw new Error("processing_cancelled");
  }
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > LIMITS.videoDurationMs ||
    !Number.isSafeInteger(options.stdoutLimitBytes) ||
    options.stdoutLimitBytes < 0 ||
    options.stdoutLimitBytes > LIMITS.probeMetadataBytes
  ) {
    throw new Error("processing_invalid_limits");
  }
  state.initialization ??= _initialize({ state, options: config, scratchPath });
  await state.initialization;
  if (state.disposed || state.group === undefined) {
    throw new Error("processing_disposed");
  }
  await state.group.checkHeadroom();
  await _checkDisk(scratchPath);
  return runMediaChild({
    options: {
      ...options,
      signal: AbortSignal.any([options.signal, state.shutdown.signal]),
    },
    context: {
      group: state.group,
      scratchPath,
      checkDisk: () => {
        return _checkDisk(scratchPath);
      },
      clock: config.clock,
    },
  });
}

async function _dispose({
  state,
  scratchPath,
}: {
  state: RunnerState;
  scratchPath: string;
}): Promise<void> {
  state.disposed = true;
  state.shutdown.abort();
  await state.active?.catch(() => {
    return undefined;
  });
  await state.initialization?.catch(() => {
    return undefined;
  });
  if (state.group !== undefined) {
    await state.group.dispose();
    state.group = undefined;
  }
  if (state.ownedScratch) {
    await rm(scratchPath, { recursive: true, force: true });
    state.ownedScratch = false;
  }
}

/**
 * Owns one exclusive job group and scratch directory across all child commands.
 */
export function createMediaProcessRunner(options: Readonly<RunnerOptions>): {
  /** Files stay here; accepted outputs belong under output/. */
  readonly scratchPath: string;
  /** Runs one command at a time within the same isolated job. */
  run: (
    command: Readonly<MediaChildOptions>,
  ) => Promise<{ stdout: string; exitCode: number }>;
  /** Cancels descendants before deleting this job's owned files. */
  dispose: () => Promise<void>;
} {
  const scratchPath = join(options.scratchRoot, `job-${randomUuid()}`);
  const state: RunnerState = {
    group: undefined,
    initialization: undefined,
    active: undefined,
    disposed: false,
    ownedScratch: false,
    shutdown: new AbortController(),
  };
  return {
    // Files must stay here; accepted outputs belong under output/.
    get scratchPath(): string {
      return scratchPath;
    },
    // Commands are sequential; callers retain the same job for all phases.
    run: async (
      command: Readonly<MediaChildOptions>,
    ): Promise<{ stdout: string; exitCode: number }> => {
      if (state.active !== undefined) {
        throw new Error("processing_job_busy");
      }
      state.active = _run({
        options: command,
        state,
        config: options,
        scratchPath,
      });
      try {
        return await state.active;
      } finally {
        state.active = undefined;
      }
    },
    // Cancels all descendants before deleting only this job's owned files.
    dispose: async (): Promise<void> => {
      await _dispose({ state, scratchPath });
    },
  };
}

/**
 * The per-job runtime passed to probing, photo/video and fingerprint recipes.
 */
export type MediaProcessRunner = ReturnType<typeof createMediaProcessRunner>;
