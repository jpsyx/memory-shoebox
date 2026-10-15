import type { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { acquireMediaCgroupLock } from "./acquireMediaCgroupLock.ts";

const fixture = vi.hoisted(() => {
  return {
    child: undefined as
      | (EventEmitter & { kill: ReturnType<typeof vi.fn> })
      | undefined,
    close: vi.fn(),
  };
});
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    spawn: () => {
      fixture.child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      return fixture.child;
    },
  };
});
vi.mock("node:fs/promises", () => {
  return {
    open: async () => {
      return {
        fd: 3,
        close: fixture.close,
        stat: async () => {
          return { dev: 1, ino: 1 };
        },
      };
    },
    stat: async () => {
      return { dev: 1, ino: 1 };
    },
    realpath: async (path: string) => {
      return path;
    },
  };
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("fails closed when acquisition times out even if a late helper reports success", async () => {
  vi.useFakeTimers();
  const acquisition = acquireMediaCgroupLock("/owned");
  const rejected = expect(acquisition).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(fixture.child!.kill).toHaveBeenCalledWith("SIGKILL");
  fixture.child!.emit("close", 0);
  await rejected;
  expect(fixture.close).toHaveBeenCalledOnce();
});
it("closes its descriptor after helper startup failure", async () => {
  const acquisition = acquireMediaCgroupLock("/owned");
  const rejected = expect(acquisition).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  await Promise.resolve();
  fixture.child!.emit("error", new Error("flock unavailable"));
  await rejected;
  expect(fixture.close).toHaveBeenCalledOnce();
});
