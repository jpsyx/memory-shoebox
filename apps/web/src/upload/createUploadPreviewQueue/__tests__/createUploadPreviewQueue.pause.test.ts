import { waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { createUploadDecodeCoordinator } from "../../createUploadDecodeCoordinator/createUploadDecodeCoordinator";
import { makePreviewHarnessFromOptions } from "./makePreviewHarnessFromOptions";

it.each(["resume", "release", "deactivate", "destroy"] as const)(
  "preserves a paused shared-slot request through %s without starting its decoder",
  async (action) => {
    const coordinator = createUploadDecodeCoordinator();
    const held = Promise.withResolvers<void>();
    const active = coordinator.run({
      priority: "active",
      signal: new AbortController().signal,
      work: () => {
        return held.promise;
      },
    });
    const harness = makePreviewHarnessFromOptions({
      decodeCoordinator: coordinator,
    });
    harness.request("paused");
    harness.queue.setPaused(true);
    held.resolve();
    await active;
    // Drain the shared coordinator and queue promise lifetimes.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(harness.workers).toHaveLength(0);
    expect(harness.requests).toHaveLength(0);
    expect(harness.queue.getPreview("paused")?.kind).toBe("preparing");
    if (action === "resume") {
      harness.queue.setPaused(false);
      await waitFor(() => {
        expect(harness.requests).toHaveLength(1);
      });
      harness.answer({ index: 0 });
      await waitFor(() => {
        expect(harness.queue.getPreview("paused")?.kind).toBe("ready");
      });
      harness.queue.setPaused(false);
      expect(harness.requests).toHaveLength(1);
    } else {
      if (action === "destroy") {
        harness.queue.destroy();
      } else {
        harness.queue[action]("paused");
      }
      harness.queue.setPaused(false);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(harness.workers).toHaveLength(0);
      expect(harness.queue.getPreview("paused")).toBeUndefined();
    }
    harness.queue.destroy();
    coordinator.dispose();
  },
);
