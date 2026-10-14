import { describe, expect, it } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { createMediaPreviewStore } from "./createMediaPreviewStore";

function _preview(itemId: string) {
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
    store.put(
      Array.from({ length: 64 }, (_, index) => {
        return _preview(String(index));
      }),
    );
    expect(store.read("0")?.itemId).toBe("0");
    store.put([_preview("64")]);
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
      activeStore.put(previews, epoch);
      oldStore.put(previews, epoch);
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
    store.put([_preview("seed")]);
    store.clear();
    store.put([_preview("late")], oldEpoch);
    store.put([_preview("fresh")], store.captureEpoch());
    expect(store.read("seed")).toBeUndefined();
    expect(store.read("late")).toBeUndefined();
    expect(store.read("fresh")?.itemId).toBe("fresh");
    const replacement = createMediaPreviewStore("member");
    replacement.put([_preview("late")], store.captureEpoch());
    expect(replacement.read("late")).toBeUndefined();
  });
});
