import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePreviewHarnessFromOptions } from "./uploadPreviewTestHelpers";

afterEach(() => {
  return vi.restoreAllMocks();
});
describe("upload preview cache", () => {
  it("retains a ready thumbnail on scroll-out and reuses its stable URL on reentry", async () => {
    const harness = makePreviewHarnessFromOptions();
    const onChange = vi.fn();
    harness.queue.subscribe(onChange);
    harness.request("ready");
    harness.answer({ index: 0 });
    await waitFor(() => {
      expect(harness.queue.getPreview("ready")?.kind).toBe("ready");
    });
    const ready = harness.queue.getPreview("ready");
    harness.queue.deactivate("ready");
    expect(harness.queue.getPreview("ready")).toBe(ready);
    harness.request("ready");
    expect(harness.queue.getPreview("ready")).toBe(ready);
    expect(harness.requests).toHaveLength(1);
    expect(harness.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(harness.createObjectUrl.mock.calls[0]![0].size).toBe(5);
    expect(harness.revokeObjectUrl).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(2);
    harness.queue.destroy();
  });
  it("retains unavailable results on scroll-out without retrying a failed decode", async () => {
    const harness = makePreviewHarnessFromOptions();
    harness.request("empty");
    harness.answer({ index: 0, empty: true });
    await waitFor(() => {
      expect(harness.queue.getPreview("empty")?.kind).toBe("unavailable");
    });
    const unavailable = harness.queue.getPreview("empty");
    harness.queue.deactivate("empty");
    harness.request("empty");
    expect(harness.queue.getPreview("empty")).toBe(unavailable);
    expect(harness.requests).toHaveLength(1);
    harness.queue.destroy();
  });
  it("evicts the least recently requested inactive thumbnail at the entry budget", async () => {
    const harness = makePreviewHarnessFromOptions({ maxCachedEntries: 2 });
    harness.request("first");
    harness.answer({ index: 0 });
    await waitFor(() => {
      expect(harness.queue.getPreview("first")?.kind).toBe("ready");
    });
    harness.queue.deactivate("first");
    harness.request("second");
    harness.answer({ index: 1 });
    await waitFor(() => {
      expect(harness.queue.getPreview("second")?.kind).toBe("ready");
    });
    harness.queue.deactivate("second");
    harness.request("first");
    harness.queue.deactivate("first");
    harness.request("third");
    harness.answer({ index: 2 });
    await waitFor(() => {
      expect(harness.queue.getPreview("third")?.kind).toBe("ready");
    });
    expect(harness.queue.getPreview("first")?.kind).toBe("ready");
    expect(harness.queue.getPreview("second")).toBeUndefined();
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:preview-2");
    expect(harness.revokeObjectUrl).toHaveBeenCalledTimes(1);
    harness.queue.destroy();
  });
  it("evicts inactive thumbnail bytes independently of the entry budget", async () => {
    const harness = makePreviewHarnessFromOptions({ maxCachedBytes: 10 });
    harness.request("first");
    harness.answer({ index: 0, thumbBytes: 8 });
    await waitFor(() => {
      expect(harness.queue.getPreview("first")?.kind).toBe("ready");
    });
    harness.queue.deactivate("first");
    harness.request("second");
    harness.answer({ index: 1, thumbBytes: 8 });
    await waitFor(() => {
      expect(harness.queue.getPreview("second")?.kind).toBe("ready");
    });
    expect(harness.queue.getPreview("first")).toBeUndefined();
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:preview-1");
    harness.queue.destroy();
  });
  it("pins active thumbnails over both soft budgets until they leave the prefetch area", async () => {
    const harness = makePreviewHarnessFromOptions({
      maxCachedEntries: 1,
      maxCachedBytes: 4,
    });
    harness.request("first");
    harness.answer({ index: 0 });
    await waitFor(() => {
      expect(harness.queue.getPreview("first")?.kind).toBe("ready");
    });
    harness.request("second");
    harness.answer({ index: 1 });
    await waitFor(() => {
      expect(harness.queue.getPreview("second")?.kind).toBe("ready");
    });
    expect(harness.queue.getPreview("first")?.kind).toBe("ready");
    expect(harness.revokeObjectUrl).not.toHaveBeenCalled();
    harness.queue.deactivate("first");
    expect(harness.queue.getPreview("first")).toBeUndefined();
    expect(harness.queue.getPreview("second")?.kind).toBe("ready");
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith("blob:preview-1");
    harness.queue.destroy();
  });
  it("scroll-out cancels a paused queued preview before any decode starts", () => {
    const harness = makePreviewHarnessFromOptions();
    harness.queue.setPaused(true);
    harness.request("cancelled");
    harness.request("waiting");
    harness.queue.deactivate("cancelled");
    expect(harness.queue.getPreview("cancelled")).toBeUndefined();
    harness.queue.setPaused(false);
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]!.request.file).toMatchObject({
      name: "waiting.jpg",
    });
    harness.queue.destroy();
  });
  it("destroy revokes cached inactive and pinned thumbnails and stops the worker", async () => {
    const harness = makePreviewHarnessFromOptions();
    harness.request("cached");
    harness.answer({ index: 0 });
    await waitFor(() => {
      expect(harness.queue.getPreview("cached")?.kind).toBe("ready");
    });
    harness.queue.deactivate("cached");
    harness.request("pinned");
    harness.answer({ index: 1 });
    await waitFor(() => {
      expect(harness.queue.getPreview("pinned")?.kind).toBe("ready");
    });
    harness.queue.destroy();
    harness.queue.destroy();
    expect(harness.queue.getPreview("cached")).toBeUndefined();
    expect(harness.queue.getPreview("pinned")).toBeUndefined();
    expect(harness.revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(harness.workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });
});
