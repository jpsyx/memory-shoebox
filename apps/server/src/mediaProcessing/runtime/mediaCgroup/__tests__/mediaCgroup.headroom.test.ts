import { expect, it, vi } from "vitest";
import { fixture } from "./mediaCgroupTestFixture.ts";
import { createMediaCgroup } from "../mediaCgroup.ts";
import { createMediaProcessingRuntime } from "../../../createMediaProcessingRuntime.ts";
import {
  createMediaProcessRunner,
  type MediaProcessRunner,
} from "../../createMediaProcessRunner.ts";

vi.mock("../../checkMediaCodecs.ts", () => {
  return {
    checkMediaCodecs: async (
      runner: MediaProcessRunner,
      signal: AbortSignal,
    ) => {
      await runner.run({
        executable: "/bin/true",
        args: [],
        signal,
        timeoutMs: 1000,
        stdoutLimitBytes: 0,
      });
    },
  };
});
vi.mock("../../runMediaChild.ts", () => {
  return {
    runMediaChild: async () => {
      fixture.commands++;
      return { stdout: "", exitCode: 0 };
    },
  };
});

it("retires owned memory before the first capability result can cache unavailable", async () => {
  fixture.maximumBytes = 512 * 1024 ** 2;
  fixture.servingBytes = 64 * 1024 ** 2;
  fixture.orphanBytes = 192 * 1024 ** 2;
  fixture.populated = true;
  const runtime = createMediaProcessingRuntime({
    enabled: true,
    cgroupRoot: "/sys/fs/cgroup/owned",
    scratchRoot: "/scratch",
  });
  const signal = new AbortController().signal;
  const first = await runtime.getCapabilities(signal);
  const retiredBeforeRetry = !fixture.populated && fixture.removals > 0;
  fixture.populated = false;
  const afterMemoryRelease = await runtime.getCapabilities(signal);
  expect({ first, afterMemoryRelease }).toEqual({
    first: { available: true, reason: null },
    afterMemoryRelease: { available: true, reason: null },
  });
  expect(afterMemoryRelease).toBe(first);
  expect(retiredBeforeRetry).toBe(true);
  expect(fixture.commands).toBe(1);
  expect(fixture.locked).toBe(false);
});

it("refuses new admission when serving memory remains too high after owned recovery", async () => {
  fixture.maximumBytes = 512 * 1024 ** 2;
  fixture.servingBytes = 160 * 1024 ** 2;
  fixture.orphanBytes = 128 * 1024 ** 2;
  fixture.populated = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_serving_headroom",
  );
  expect(fixture.kills).toBe(1);
  expect(fixture.removals).toBe(1);
  expect(fixture.creations).toBe(0);
  expect(fixture.commands).toBe(0);
  expect(fixture.locked).toBe(false);
});

it.each(["live", "unknown"])(
  "does not reclaim %s owner's memory to satisfy headroom",
  async (ownership) => {
    fixture.maximumBytes = 512 * 1024 ** 2;
    fixture.orphanBytes = 256 * 1024 ** 2;
    fixture.populated = true;
    if (ownership === "live") {
      fixture.live = true;
    } else {
      fixture.controls.clear();
    }
    await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
      ownership === "live"
        ? "processing_group_owned"
        : "processing_group_unrecognized",
    );
    expect(fixture.kills).toBe(0);
    expect(fixture.removals).toBe(0);
    expect(fixture.creations).toBe(0);
  },
);

it("rechecks serving headroom before every command in an admitted lifetime", async () => {
  fixture.maximumBytes = 512 * 1024 ** 2;
  const runner = createMediaProcessRunner({
    cgroupRoot: "/sys/fs/cgroup/owned",
    scratchRoot: "/scratch",
    clock: Date.now,
  });
  const command = {
    executable: "/bin/true",
    args: [],
    signal: new AbortController().signal,
    timeoutMs: 1000,
    stdoutLimitBytes: 0,
  };
  await runner.run(command);
  fixture.servingBytes = 160 * 1024 ** 2;
  await expect(runner.run(command)).rejects.toThrow(
    "processing_serving_headroom",
  );
  expect(fixture.commands).toBe(1);
  await runner.dispose();
  expect(fixture.locked).toBe(false);
});
