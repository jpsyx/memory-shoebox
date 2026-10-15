import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMediaCgroup } from "./mediaCgroup.ts";

const fixture = vi.hoisted(() => {
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
    kills: 0,
    removals: 0,
    controls: new Map<string, string>(),
  };
});
vi.mock("../acquireMediaCgroupLock/acquireMediaCgroupLock.ts", () => {
  return {
    acquireMediaCgroupLock: async () => {
      if (fixture.locked) {
        throw new Error("processing_group_owned");
      }
      fixture.locked = true;
      return {
        fd: 40,
        close: async () => {
          fixture.locked = false;
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
      return { dev: 1, ino: fixture.replaced ? 2 : 1 };
    },
    readdir: async () => {
      return fixture.exists
        ? [
            fixture.legacy
              ? "memory-shoebox-job"
              : "memory-shoebox-job-v1-11111111-1111-4111-8111-111111111111-12345-50",
          ]
        : [];
    },
    realpath: async (path: string) => {
      return path;
    },
    statfs: async () => {
      return { type: 0x63677270 };
    },
    access: async () => {},
    mkdir: async () => {
      if (fixture.failCreation) {
        throw new Error("create failed");
      }
      if (fixture.exists) {
        throw Object.assign(new Error("exists"), { code: "EEXIST" });
      }
      fixture.exists = true;
    },
    rmdir: async () => {
      if (fixture.failCleanup && fixture.removals > 0) {
        throw new Error("cleanup failed");
      }
      fixture.removals++;
      fixture.exists = false;
    },
    writeFile: async (path: string, value: string) => {
      if (fixture.failInitialization && path.endsWith("memory.swap.max")) {
        throw new Error("control write failed");
      }
      if (path.endsWith("cgroup.kill")) {
        fixture.kills++;
        fixture.killPaths.push(path);
        if (!fixture.stubborn) {
          fixture.populated = false;
        }
      } else {
        fixture.controls.set(path.split("/").at(-1)!, value);
      }
    },
    readFile: async (path: string) => {
      if (path === "/proc/sys/kernel/random/boot_id") {
        return "11111111-1111-4111-8111-111111111111";
      }
      if (/^\/proc\/\d+\/stat$/.test(path)) {
        if (path === "/proc/12345/stat" && !fixture.live) {
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
        return `populated ${fixture.populated ? 1 : 0}`;
      }
      if (path.includes("memory-shoebox-job") || path.includes("/fd/41")) {
        if (path.endsWith("cgroup.procs")) {
          return fixture.populated ? "123" : "";
        }
        return fixture.controls.get(path.split("/").at(-1)!) ?? "max";
      }
      if (path.endsWith("cgroup.procs")) {
        return "";
      }
      if (path.endsWith("memory.max")) {
        return "1073741824";
      }
      if (path.endsWith("memory.current")) {
        return "0";
      }
      return "";
    },
  };
});

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("linux");
  Object.assign(fixture, {
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
    kills: 0,
    removals: 0,
  });
  fixture.controls = new Map([
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

it("reclaims a crash-left empty job and admits another owned lifetime", async () => {
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.removals).toBe(1);
  await group.checkHeadroom();
  await group.dispose();
  const subsequent = await createMediaCgroup("/sys/fs/cgroup/owned");
  await subsequent.checkHeadroom();
  await subsequent.dispose();
  expect(fixture.locked).toBe(false);
});
it("reclaims an empty group interrupted before controls were written without killing", async () => {
  fixture.controls.clear();
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.kills).toBe(0);
  expect(fixture.controls.get("memory.max")).toBe("268435456");
  await group.dispose();
});
it("refuses a live competing API owner without touching its job", async () => {
  fixture.locked = true;
  fixture.populated = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_owned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("retires a configured orphan before admitting new work", async () => {
  fixture.populated = true;
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.kills).toBe(1);
  expect(fixture.removals).toBe(1);
  await group.dispose();
});
it("refuses an unknown populated group without killing it", async () => {
  fixture.populated = true;
  fixture.controls.clear();
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_unrecognized",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("bounds orphan retirement and never admits a replacement over surviving children", async () => {
  vi.useFakeTimers();
  fixture.populated = true;
  fixture.stubborn = true;
  const failed = expect(
    createMediaCgroup("/sys/fs/cgroup/owned"),
  ).rejects.toThrow("processing_group_shutdown_failed");
  await vi.runAllTimersAsync();
  await failed;
  expect(fixture.kills).toBe(1);
  expect(fixture.removals).toBe(0);
  expect(fixture.locked).toBe(true);
});

it("refuses an identifiable live owner even if that process lost cooperative locking", async () => {
  fixture.live = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_owned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("refuses an unidentifiable legacy group even when empty", async () => {
  fixture.legacy = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_legacy_unowned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});

it("anchors orphan controls to its opened directory before retiring it", async () => {
  fixture.populated = true;
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.killPaths[0]).toBe(`/proc/${process.pid}/fd/41/cgroup.kill`);
  await group.dispose();
});
it("refuses removal after directory replacement and retains ownership on failed disposal", async () => {
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  fixture.replaced = true;
  await expect(group.dispose()).rejects.toThrow(
    "processing_group_identity_changed",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(true);
});

it("removes only the new empty group after failed control initialization", async () => {
  fixture.failInitialization = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  expect(fixture.removals).toBe(2);
  expect(fixture.kills).toBe(0);
  expect(fixture.locked).toBe(false);
});
it("retains the root lock when failed initialization cannot remove its own group", async () => {
  fixture.failInitialization = true;
  fixture.failCleanup = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "cleanup failed",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(true);
});
it("does not remove a current name when group creation failed", async () => {
  fixture.failCreation = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(false);
});
