import { describe, expect, it } from "vitest";
import { createMediaOperationGate } from "./createMediaOperationGate";

function _deferred(): { promise: Promise<void>; finish: () => void } {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

describe("shared speculative operations", () => {
  it("keeps only two operations active until actual settlement", async () => {
    const gate = createMediaOperationGate();
    const transfer = _deferred();
    const metadata = _deferred();
    const controller = new AbortController();
    const starts: string[] = [];
    const first = gate.run({
      signal: controller.signal,
      operation: () => {
        starts.push("image");
        return transfer.promise;
      },
    });
    const second = gate.run({
      signal: new AbortController().signal,
      operation: () => {
        starts.push("metadata");
        return metadata.promise;
      },
    });
    const third = gate.run({
      signal: new AbortController().signal,
      operation: async () => {
        starts.push("next");
      },
    });
    await Promise.resolve();
    controller.abort();
    await Promise.resolve();
    expect(starts).toEqual(["image", "metadata"]);
    metadata.finish();
    await second;
    await third;
    expect(starts).toEqual(["image", "metadata", "next"]);
    transfer.finish();
    await first;
  });

  it("removes aborted queued work without ever starting it", async () => {
    const gate = createMediaOperationGate();
    const first = _deferred();
    const second = _deferred();
    const pending = [first, second].map((transfer) => {
      return gate.run({
        signal: new AbortController().signal,
        operation: () => {
          return transfer.promise;
        },
      });
    });
    let didStart = false;
    const controller = new AbortController();
    const queued = gate.run({
      signal: controller.signal,
      operation: async () => {
        didStart = true;
      },
    });
    const rejected = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    first.finish();
    second.finish();
    await Promise.all(pending);
    expect(didStart).toBe(false);
  });

  it("returns a slot after failure", async () => {
    const gate = createMediaOperationGate();
    await expect(
      gate.run({
        signal: new AbortController().signal,
        operation: async () => {
          throw new Error("failed");
        },
      }),
    ).rejects.toThrow("failed");
    const first = _deferred();
    let starts = 0;
    const pending = [0, 1].map(() => {
      return gate.run({
        signal: new AbortController().signal,
        operation: async () => {
          starts += 1;
          await first.promise;
        },
      });
    });
    await Promise.resolve();
    expect(starts).toBe(2);
    first.finish();
    await Promise.all(pending);
  });
});
