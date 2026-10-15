import { afterEach, beforeEach, vi } from "vitest";

const fixtureState = vi.hoisted(() => {
  return {
    failInitialization: false,
    failCleanup: false,
    failCreation: false,
    exists: true,
    replaced: false,
    killPaths: [] as string[],
    populated: false,
    stubborn: false,
    configured: true,
    live: false,
    legacy: false,
    locked: false,
    orphanBytes: 0,
    servingBytes: 0,
    maximumBytes: 1073741824,
    commands: 0,
    creations: 0,
    kills: 0,
    removals: 0,
    controls: new Map<string, string>(),
  };
});
/** Controlled cgroup state; populated orphan bytes contribute to ancestor usage. */
export const fixture = fixtureState;
vi.mock("../../acquireMediaCgroupLock/acquireMediaCgroupLock.ts", () => {
  return {
    acquireMediaCgroupLock: async () => {
      if (fixtureState.locked) {
        throw new Error("processing_group_owned");
      }
      fixtureState.locked = true;
      return {
        fd: 40,
        close: async () => {
          fixtureState.locked = false;
        },
      };
    },
  };
});
vi.mock("node:fs/promises", () => {
  return {
    open: async () => {
      return {
        fd: 41,
        stat: async () => {
          return { dev: 1, ino: 1 };
        },
        close: async () => {},
      };
    },
    stat: async () => {
      return { dev: 1, ino: fixtureState.replaced ? 2 : 1 };
    },
    readdir: async (path: string) => {
      if (path.startsWith("/scratch")) {
        return [];
      }
      return fixtureState.exists
        ? [
            fixtureState.legacy
              ? "memory-shoebox-job"
              : "memory-shoebox-job-v1-11111111-1111-4111-8111-111111111111-12345-50",
          ]
        : [];
    },
    realpath: async (path: string) => {
      return path;
    },
    statfs: async () => {
      return { type: 0x63677270, bavail: 1024 ** 3, bsize: 4096 };
    },
    access: async () => {},
    rm: async () => {},
    mkdir: async (path: string) => {
      if (path.startsWith("/scratch")) {
        return;
      }
      fixtureState.creations++;
      if (fixtureState.failCreation) {
        throw new Error("create failed");
      }
      if (fixtureState.exists) {
        throw Object.assign(new Error("exists"), { code: "EEXIST" });
      }
      fixtureState.exists = true;
    },
    rmdir: async () => {
      if (fixtureState.failCleanup && fixtureState.removals > 0) {
        throw new Error("cleanup failed");
      }
      fixtureState.removals++;
      fixtureState.exists = false;
    },
    writeFile: async (path: string, value: string) => {
      if (fixtureState.failInitialization && path.endsWith("memory.swap.max")) {
        throw new Error("control write failed");
      }
      if (path.endsWith("cgroup.kill")) {
        fixtureState.kills++;
        fixtureState.killPaths.push(path);
        if (!fixtureState.stubborn) {
          fixtureState.populated = false;
        }
      } else {
        fixtureState.controls.set(path.split("/").at(-1)!, value);
      }
    },
    readFile: async (path: string) => {
      if (path === "/proc/sys/kernel/random/boot_id") {
        return "11111111-1111-4111-8111-111111111111";
      }
      if (/^\/proc\/\d+\/stat$/.test(path)) {
        if (path === "/proc/12345/stat" && !fixtureState.live) {
          throw Object.assign(new Error("dead"), { code: "ENOENT" });
        }
        return `12345 (owned process) S ${Array(18).fill("0").join(" ")} ${path === "/proc/12345/stat" ? "50" : "100"}`;
      }
      if (path === "/proc/meminfo") {
        return "MemAvailable: 1048576 kB";
      }
      if (path.endsWith("cgroup.subtree_control")) {
        return "cpu memory";
      }
      if (path.endsWith("cgroup.events")) {
        return `populated ${fixtureState.populated ? 1 : 0}`;
      }
      if (path.includes("memory-shoebox-job") || path.includes("/fd/41")) {
        if (path.endsWith("cgroup.procs")) {
          return fixtureState.populated ? "123" : "";
        }
        return fixtureState.controls.get(path.split("/").at(-1)!) ?? "max";
      }
      if (path.endsWith("cgroup.procs")) {
        return "";
      }
      if (path.endsWith("memory.max")) {
        return String(fixtureState.maximumBytes);
      }
      if (path.endsWith("memory.current")) {
        return String(
          fixtureState.servingBytes +
            (fixtureState.populated ? fixtureState.orphanBytes : 0),
        );
      }
      return "";
    },
  };
});

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("linux");
  Object.assign(fixtureState, {
    failInitialization: false,
    failCleanup: false,
    failCreation: false,
    exists: true,
    replaced: false,
    killPaths: [],
    populated: false,
    stubborn: false,
    live: false,
    legacy: false,
    locked: false,
    orphanBytes: 0,
    servingBytes: 0,
    maximumBytes: 1073741824,
    commands: 0,
    creations: 0,
    kills: 0,
    removals: 0,
  });
  fixtureState.controls = new Map([
    ["memory.max", "268435456"],
    ["memory.swap.max", "0"],
    ["memory.oom.group", "1"],
    ["cpu.max", "100000 100000"],
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
