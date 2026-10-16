import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import {
  access,
  mkdir,
  readFile,
  realpath,
  statfs,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_CONFIG } from "../../../../../../app.config.ts";
import { acquireMediaCgroupLock } from "../acquireMediaCgroupLock/acquireMediaCgroupLock.ts";
import { getMediaGroupOwnershipFromRoot } from "./getMediaGroupOwnershipFromRoot.ts";
import {
  openMediaGroupDirectory,
  type MediaGroupDirectory,
} from "./openMediaGroupDirectory.ts";

const LIMITS = APP_CONFIG.mediaProcessing;
// Every active or failed lifetime retains kernel ownership until disposal.
const retainedDescriptors = new Set<FileHandle>();
const CGROUP_V2_MAGIC = 0x63677270;
const CONTROLS = {
  "memory.max": String(LIMITS.memoryBytes),
  "memory.swap.max": "0",
  "memory.oom.group": "1",
  "cpu.max": "100000 100000",
} satisfies Record<string, string>;

/** The owned Linux job group, never the serving process's group. */
export type MediaCgroup = {
  path: string;
  checkHeadroom: () => Promise<void>;
  kill: () => Promise<void>;
  getOomKills: () => Promise<number>;
  dispose: () => Promise<void>;
};

async function _readControl({
  path,
  name,
}: {
  path: string;
  name: string;
}): Promise<string> {
  return (await readFile(join(path, name), "utf8")).trim();
}

async function _checkHeadroom(root: string): Promise<void> {
  if (root === "/sys/fs/cgroup") {
    await _checkSystemHeadroom();
  }
  const [maximum, current] = await Promise.all([
    _readControl({ path: root, name: "memory.max" }).catch((error: unknown) => {
      if (root === "/sys/fs/cgroup" && _isMissing(error)) {
        return "max";
      }
      throw error;
    }),
    _readControl({ path: root, name: "memory.current" }).catch(
      (error: unknown) => {
        if (root === "/sys/fs/cgroup" && _isMissing(error)) {
          return "0";
        }
        throw error;
      },
    ),
  ]);
  if (
    maximum !== "max" &&
    Number(maximum) - Number(current) <
      LIMITS.memoryBytes + LIMITS.servingHeadroomBytes
  ) {
    throw new Error("processing_serving_headroom");
  }
  if (root !== "/sys/fs/cgroup") {
    await _checkHeadroom(dirname(root));
  }
}

function _isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function _checkSystemHeadroom(): Promise<void> {
  const memory = await readFile("/proc/meminfo", "utf8");
  const available =
    Number(/^MemAvailable:\s+(\d+) kB/m.exec(memory)?.[1]) * 1024;
  if (
    !Number.isFinite(available) ||
    available < LIMITS.memoryBytes + LIMITS.servingHeadroomBytes
  ) {
    throw new Error("processing_serving_headroom");
  }
}

async function _validateDelegation(root: string): Promise<void> {
  if (
    process.platform !== "linux" ||
    !isAbsolute(root) ||
    !root.startsWith("/sys/fs/cgroup/")
  ) {
    throw new Error("processing_isolation_unavailable");
  }
  if (
    (await realpath(root)) !== root ||
    (await statfs(root)).type !== CGROUP_V2_MAGIC
  ) {
    throw new Error("processing_isolation_unavailable");
  }
  await _validateRootControls(root);
}

async function _validateRootControls(root: string): Promise<void> {
  if ((await statfs(root)).type !== CGROUP_V2_MAGIC) {
    throw new Error("processing_isolation_unavailable");
  }
  const [members, controllers] = await Promise.all([
    _readControl({ path: root, name: "cgroup.procs" }),
    _readControl({ path: root, name: "cgroup.subtree_control" }),
  ]);
  if (
    members !== "" ||
    !["cpu", "memory"].every((name) => {
      return controllers.split(" ").includes(name);
    })
  ) {
    throw new Error("processing_isolation_unavailable");
  }
}

async function _waitForEmpty({
  path,
  attempts = 100,
}: {
  path: string;
  attempts?: number;
}): Promise<void> {
  const events = await _readControl({ path, name: "cgroup.events" });
  if (/^populated 0$/m.test(events)) {
    return;
  }
  if (!/^populated 1$/m.test(events)) {
    throw new Error("processing_group_unrecognized");
  }
  if (attempts === 0) {
    throw new Error("processing_group_shutdown_failed");
  }
  await delay(20);
  await _waitForEmpty({ path, attempts: attempts - 1 });
}

function _makeGroup(
  options: Readonly<{
    directory: MediaGroupDirectory;
    root: string;
    lock: FileHandle;
  }>,
): MediaCgroup {
  const { directory, root, lock } = options;
  const { path } = directory;
  const kill = async () => {
    await writeFile(join(path, "cgroup.kill"), "1");
    await _waitForEmpty({ path });
  };
  return {
    path,
    checkHeadroom: () => {
      return _checkHeadroom(root);
    },
    kill,
    getOomKills: async () => {
      const events = await _readControl({ path, name: "memory.events.local" });
      return Number(/^oom_kill (\d+)$/m.exec(events)?.[1] ?? 0);
    },
    dispose: async () => {
      await kill();
      await directory.remove();
      await directory.descriptor.close();
      retainedDescriptors.delete(directory.descriptor);
      await lock.close();
      retainedDescriptors.delete(lock);
    },
  };
}

async function _recoverOwnedGroup(childPath: string): Promise<void> {
  const directory = await openMediaGroupDirectory(childPath);
  retainedDescriptors.add(directory.descriptor);
  const { path } = directory;
  const events = await _readControl({ path, name: "cgroup.events" });
  if (/^populated 1$/m.test(events)) {
    const recognized = await Promise.all(
      Object.entries(CONTROLS).map(async ([name, value]) => {
        return (await _readControl({ path, name })) === value;
      }),
    );
    if (!recognized.every(Boolean)) {
      throw new Error("processing_group_unrecognized");
    }
    await writeFile(join(path, "cgroup.kill"), "1");
    await _waitForEmpty({ path });
  } else if (!/^populated 0$/m.test(events)) {
    throw new Error("processing_group_unrecognized");
  }
  // Empty exact-name groups can include an interrupted initialization. No
  // children are admitted before every control is verified. Never kill them.
  await directory.remove();
  await directory.descriptor.close();
  retainedDescriptors.delete(directory.descriptor);
}

type OwnershipState = {
  ownedPath?: string;
  directory?: MediaGroupDirectory;
  isRecovering: boolean;
  lock?: FileHandle;
};

async function _initializeDirectory(
  options: Readonly<{ path: string; state: OwnershipState }>,
): Promise<MediaGroupDirectory> {
  const { path, state } = options;
  await mkdir(path);
  state.ownedPath = path;
  const directory = await openMediaGroupDirectory(path);
  state.directory = directory;
  retainedDescriptors.add(directory.descriptor);
  await Object.entries(CONTROLS).reduce(async (previous, [name, value]) => {
    await previous;
    await writeFile(join(directory.path, name), value);
    if ((await _readControl({ path: directory.path, name })) !== value) {
      throw new Error("processing_isolation_unavailable");
    }
  }, Promise.resolve());
  await access(join(directory.path, "cgroup.kill"), constants.W_OK);
  await access(join(directory.path, "cgroup.procs"), constants.W_OK);
  return directory;
}

async function _cleanFailedOwnership(state: OwnershipState): Promise<void> {
  // Failed cleanup leaves strong descriptor ownership until the API exits.
  if (state.ownedPath !== undefined) {
    if (state.directory === undefined) {
      throw new Error("processing_group_initialization_failed");
    }
    await state.directory.remove();
    await state.directory.descriptor.close();
    retainedDescriptors.delete(state.directory.descriptor);
  }
  if (state.lock !== undefined && !state.isRecovering) {
    await state.lock.close();
    retainedDescriptors.delete(state.lock);
  }
}

/** Owns one job group under a canonical, exclusively delegated subtree lock. */
export async function createMediaCgroup(root: string): Promise<MediaCgroup> {
  const state: OwnershipState = { isRecovering: false };
  try {
    await _validateDelegation(root);
    const lock = await acquireMediaCgroupLock(root);
    state.lock = lock;
    retainedDescriptors.add(lock);
    const anchoredRoot = `/proc/${process.pid}/fd/${lock.fd}`;
    await _validateRootControls(anchoredRoot);
    const ownership = await getMediaGroupOwnershipFromRoot(anchoredRoot);
    await ownership.stalePaths.reduce(async (previous, stalePath) => {
      await previous;
      state.isRecovering = true;
      await _recoverOwnedGroup(stalePath);
      state.isRecovering = false;
    }, Promise.resolve());
    // Retired descendants no longer consume the ancestor's admission reserve.
    await _checkHeadroom(root);
    const directory = await _initializeDirectory({
      path: ownership.currentPath,
      state,
    });
    return _makeGroup({ directory, root, lock });
  } catch (error) {
    await _cleanFailedOwnership(state);
    if (
      error instanceof Error &&
      /^processing_(serving_headroom|group_)/.test(error.message)
    ) {
      throw error;
    }
    throw new Error("processing_isolation_unavailable");
  }
}
