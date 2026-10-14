import {
  access,
  mkdir,
  readFile,
  realpath,
  rmdir,
  statfs,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { appConfig } from "../../../../../app.config.ts";

const LIMITS = appConfig.mediaProcessing;
const CGROUP_V2_MAGIC = 0x63677270;

/** The owned Linux job group, never the serving process's group. */
export type MediaCgroup = {
  path: string;
  checkHeadroom: () => Promise<void>;
  kill: () => Promise<void>;
  getOomKills: () => Promise<number>;
  dispose: () => Promise<void>;
};

async function _readControl(path: string, name: string): Promise<string> {
  return (await readFile(join(path, name), "utf8")).trim();
}

async function _checkHeadroom(root: string): Promise<void> {
  if (root === "/sys/fs/cgroup") {
    await _checkSystemHeadroom();
  }
  const [maximum, current] = await Promise.all([
    _readControl(root, "memory.max").catch((error: unknown) => {
      if (root === "/sys/fs/cgroup" && _isMissing(error)) {
        return "max";
      }
      throw error;
    }),
    _readControl(root, "memory.current").catch((error: unknown) => {
      if (root === "/sys/fs/cgroup" && _isMissing(error)) {
        return "0";
      }
      throw error;
    }),
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
  const [members, controllers] = await Promise.all([
    _readControl(root, "cgroup.procs"),
    _readControl(root, "cgroup.subtree_control"),
  ]);
  if (
    members !== "" ||
    !["cpu", "memory"].every((name) => {
      return controllers.split(" ").includes(name);
    })
  ) {
    throw new Error("processing_isolation_unavailable");
  }
  await _checkHeadroom(root);
}

async function _waitForEmpty(path: string, attempts = 100): Promise<void> {
  if (!(await _readControl(path, "cgroup.events")).includes("populated 1")) {
    return;
  }
  if (attempts === 0) {
    throw new Error("processing_group_shutdown_failed");
  }
  await delay(20);
  await _waitForEmpty(path, attempts - 1);
}

function _makeGroup(path: string, root: string): MediaCgroup {
  const kill = async () => {
    await writeFile(join(path, "cgroup.kill"), "1");
    await _waitForEmpty(path);
  };
  return {
    path,
    checkHeadroom: () => {
      return _checkHeadroom(root);
    },
    kill,
    getOomKills: async () => {
      const events = await _readControl(path, "memory.events.local");
      return Number(/^oom_kill (\d+)$/m.exec(events)?.[1] ?? 0);
    },
    dispose: async () => {
      await kill();
      await rmdir(path);
    },
  };
}

/** Creates one exclusive job group only inside an already delegated subtree. */
export async function createMediaCgroup(root: string): Promise<MediaCgroup> {
  let ownedPath: string | undefined;
  try {
    await _validateDelegation(root);
    const path = join(root, "memory-shoebox-job");
    await mkdir(path);
    ownedPath = path;
    const controls = {
      "memory.max": String(LIMITS.memoryBytes),
      "memory.swap.max": "0",
      "memory.oom.group": "1",
      "cpu.max": "100000 100000",
    };
    await Promise.all(
      Object.entries(controls).map(async ([name, value]) => {
        await writeFile(join(path, name), value);
        if ((await _readControl(path, name)) !== value) {
          throw new Error("processing_isolation_unavailable");
        }
      }),
    );
    await access(join(path, "cgroup.kill"), constants.W_OK);
    await access(join(path, "cgroup.procs"), constants.W_OK);
    return _makeGroup(path, root);
  } catch (error) {
    if (ownedPath !== undefined) {
      await rmdir(ownedPath).catch(() => {
        return undefined;
      });
    }
    if (
      error instanceof Error &&
      error.message === "processing_serving_headroom"
    ) {
      throw error;
    }
    throw new Error("processing_isolation_unavailable");
  }
}
