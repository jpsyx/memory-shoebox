import type { MediaPreview } from "@memory-shoebox/shared";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { describe, expect, it } from "vitest";
import { createMediaPreviewStore } from "./createMediaPreviewStore";

function _preview(itemId: string): MediaPreview {
  const detail = makeItemDetail({ itemId });
  return {
    itemId,
    kind: detail.kind,
    width: detail.media.width,
    height: detail.media.height,
    media: detail.media,
  };
}

describe("member preview store", () => {
  it("evicts the least recently read entry after 64 entries and supports removal", () => {
    const store = createMediaPreviewStore("member");
    store.put({
      previews: Array.from({ length: 64 }, (_, index) => {
        return _preview(String(index));
      }),
    });
    expect(store.read("0")?.itemId).toBe("0");
    store.put({ previews: [_preview("64")] });
    expect(store.read("1")).toBeUndefined();
    expect(store.read("0")?.itemId).toBe("0");
    store.remove("0");
    expect(store.read("0")).toBeUndefined();
  });

  it("drops responses from an old member epoch even when abort is ineffective", async () => {
    let finish: (value: Array<ReturnType<typeof _preview>>) => void = () => {};
    const response = new Promise<Array<ReturnType<typeof _preview>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    const oldStore = createMediaPreviewStore("first");
    const epoch = oldStore.captureEpoch();
    let activeStore = oldStore;
    const pending = response.then((previews) => {
      activeStore.put({ previews: previews, epoch: epoch });
      oldStore.put({ previews: previews, epoch: epoch });
    });
    oldStore.clear();
    activeStore = createMediaPreviewStore("second");
    finish([_preview("old-item")]);
    await pending;
    expect(activeStore.read("old-item")).toBeUndefined();
    expect(oldStore.read("old-item")).toBeUndefined();
  });

  it("invalidates work after clear while allowing the new epoch", () => {
    const store = createMediaPreviewStore("member");
    const oldEpoch = store.captureEpoch();
    store.put({ previews: [_preview("seed")] });
    store.clear();
    store.put({ previews: [_preview("late")], epoch: oldEpoch });
    store.put({ previews: [_preview("fresh")], epoch: store.captureEpoch() });
    expect(store.read("seed")).toBeUndefined();
    expect(store.read("late")).toBeUndefined();
    expect(store.read("fresh")?.itemId).toBe("fresh");
    const replacement = createMediaPreviewStore("member");
    replacement.put({
      previews: [_preview("late")],
      epoch: store.captureEpoch(),
    });
    expect(replacement.read("late")).toBeUndefined();
  });
});
