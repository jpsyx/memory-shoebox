import { afterEach, expect, it, vi } from "vitest";
import { createMediaProcessingRuntime } from "../../src/mediaProcessing/createMediaProcessingRuntime.ts";
import { createMediaDecodeCoordinator } from "../../src/mediaProcessing/createMediaDecodeCoordinator.ts";
import { checkMediaCodecs } from "../../src/mediaProcessing/runtime/checkMediaCodecs.ts";
import { createMediaProcessRunner } from "../../src/mediaProcessing/runtime/createMediaProcessRunner.ts";

vi.mock("../../src/mediaProcessing/runtime/checkMediaCodecs.ts", () => {
  return {
    checkMediaCodecs: vi.fn(),
  };
});
vi.mock("../../src/mediaProcessing/runtime/createMediaProcessRunner.ts", () => {
  return { createMediaProcessRunner: vi.fn() };
});
afterEach(() => {
  return vi.resetAllMocks();
});

it("drains cancelled capability work before releasing the lane and does not cache cancellation", async () => {
  const started = Promise.withResolvers<void>();
  const disposal = Promise.withResolvers<void>();
  const coordinator = createMediaDecodeCoordinator();
  const shutdown = new AbortController();
  let disposed = false;
  vi.mocked(createMediaProcessRunner).mockReturnValue({
    scratchPath: "/unused",
    run: async () => {
      return { stdout: "", exitCode: 0 };
    },
    dispose: async () => {
      await disposal.promise;
      disposed = true;
    },
  });
  vi.mocked(checkMediaCodecs)
    .mockImplementationOnce(async ({ signal }) => {
      started.resolve();
      await new Promise<void>((done) => {
        return signal!.addEventListener(
          "abort",
          () => {
            return done();
          },
          { once: true },
        );
      });
      signal!.throwIfAborted();
    })
    .mockResolvedValue(undefined);
  const runtime = createMediaProcessingRuntime({
    enabled: true,
    cgroupRoot: "/unused",
    scratchRoot: "/unused",
  });
  const running = coordinator.run({
    work: () => {
      return runtime.getCapabilities(shutdown.signal);
    },
    signal: shutdown.signal,
  });
  const observed = expect(running).rejects.toThrow();
  await started.promise;
  shutdown.abort();
  let followerStarted = false;
  const follower = coordinator.run({
    work: async () => {
      followerStarted = true;
    },
    signal: new AbortController().signal,
  });
  await new Promise((done) => {
    return setImmediate(done);
  });
  expect(followerStarted).toBe(false);
  disposal.resolve();
  await observed;
  await follower;
  expect(disposed).toBe(true);
  expect(await runtime.getCapabilities(new AbortController().signal)).toEqual({
    available: true,
    reason: undefined,
  });
  expect(await runtime.getCapabilities(new AbortController().signal)).toEqual({
    available: true,
    reason: undefined,
  });
  expect(checkMediaCodecs).toHaveBeenCalledTimes(2);
});
