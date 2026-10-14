import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("File", NodeFile);
  vi.stubGlobal("Blob", NodeBlob);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
import { createUploadOriginalStore } from "./createUploadOriginalStore";

describe("temporary upload originals", () => {
  it("restores exact bytes and metadata through a new store instance", async () => {
    const indexedDB = new IDBFactory();
    const scope = { memberId: "member-a", sessionId: "session-a" };
    const file = new File([new Uint8Array([0, 21, 255])], "photo.heic", {
      type: "image/heic",
      lastModified: 1234,
    });
    await createUploadOriginalStore({ indexedDB }).saveFiles({
      ...scope,
      filesById: new Map([["file-a", file]]),
    });
    const restored = (
      await createUploadOriginalStore({ indexedDB }).readFiles(scope)
    ).get("file-a")!;
    expect(restored).toBeInstanceOf(File);
    expect([restored.name, restored.type, restored.lastModified]).toEqual([
      "photo.heic",
      "image/heic",
      1234,
    ]);
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(
      new Uint8Array([0, 21, 255]),
    );
  });

  it("isolates member/session keys and removes only the requested originals", async () => {
    const store = createUploadOriginalStore({ indexedDB: new IDBFactory() });
    const scope = { memberId: "member-a", sessionId: "session-a" };
    const filesById = new Map([
      ["file-a", new File(["a"], "a.jpg")],
      ["file-b", new File(["b"], "b.jpg")],
    ]);
    await store.saveFiles({ ...scope, filesById });
    await store.saveFiles({ ...scope, memberId: "member-b", filesById });
    await store.saveFiles({ ...scope, sessionId: "session-b", filesById });
    await store.removeFiles({ ...scope, fileIds: ["file-a"] });
    expect([...(await store.readFiles(scope)).keys()]).toEqual(["file-b"]);
    await store.clearSession(scope);
    expect(await store.readFiles(scope)).toEqual(new Map());
    expect(
      (await store.readFiles({ ...scope, memberId: "member-b" })).size,
    ).toBe(2);
    expect(
      (await store.readFiles({ ...scope, sessionId: "session-b" })).size,
    ).toBe(2);
  });

  it("prunes expired originals without discarding a recent batch", async () => {
    let now = 1_000;
    const store = createUploadOriginalStore({
      indexedDB: new IDBFactory(),
      now: () => {
        return now;
      },
    });
    const scope = { memberId: "member-a", sessionId: "session-a" };
    const filesById = new Map([["file-a", new File(["a"], "a.jpg")]]);
    await store.saveFiles({ ...scope, filesById });
    now += 6 * 24 * 60 * 60 * 1_000;
    await store.saveFiles({ ...scope, sessionId: "recent", filesById });
    now += 2 * 24 * 60 * 60 * 1_000;
    expect(await store.readFiles(scope)).toEqual(new Map());
    expect(
      (await store.readFiles({ ...scope, sessionId: "recent" })).size,
    ).toBe(1);
  });

  it("keeps earlier originals when a later file exceeds storage quota", async () => {
    const store = createUploadOriginalStore({ indexedDB: new IDBFactory() });
    const scope = { memberId: "member-a", sessionId: "session-a" };
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(
      function (this: IDBObjectStore, value, key) {
        if (value.fileId === "file-b") {
          throw new DOMException("Storage is full", "QuotaExceededError");
        }
        return put.call(this, value, key);
      },
    );
    await expect(
      store.saveFiles({
        ...scope,
        filesById: new Map([
          ["file-a", new File(["a"], "a.jpg")],
          ["file-b", new File(["b"], "b.jpg")],
        ]),
      }),
    ).rejects.toThrow("Storage is full");
    const restored = await store.readFiles(scope);
    expect([...restored.keys()]).toEqual(["file-a"]);
    expect(await restored.get("file-a")!.text()).toBe("a");
  });

  it("rejects storage access failures so callers can offer file selection", async () => {
    const indexedDB = new IDBFactory();
    indexedDB.open = () => {
      throw new DOMException("Storage denied", "SecurityError");
    };
    const store = createUploadOriginalStore({ indexedDB });
    await expect(
      store.readFiles({ memberId: "member", sessionId: "session" }),
    ).rejects.toThrow("Storage denied");
  });
});
