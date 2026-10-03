import { describe, expect, it } from "vitest";
import {
  makeUploadSurfaceDetail,
  makeUploadSnapshotFromDetail,
} from "../__tests__/uploadSurfaceFixtures";
import {
  getDayFilesFromSnapshot,
  makeUploadSnapshotFromCompletion,
} from "./uploadSnapshotHelpers";

describe("uploadSnapshotHelpers", () => {
  it("exposes Map lookups for fixture-owned files and activities", () => {
    const snapshot = makeUploadSnapshotFromDetail(makeUploadSurfaceDetail());
    expect(snapshot.filesById.get("missing-file")).toBeUndefined();
    expect(snapshot.fileActivityById.get("missing-file")).toBeUndefined();
  });

  it("records completion in a new activity Map without changing prior lookups", () => {
    const detail = makeUploadSurfaceDetail({ state: "uploading" });
    const file = { ...detail.files[0]!, state: "done" as const };
    const localFile = new File(["photo"], "photo.jpg");
    const snapshot = {
      ...makeUploadSnapshotFromDetail(detail),
      filesById: new Map([[file.fileId, localFile]]),
      fileActivityById: new Map([
        [file.fileId, { kind: "preparing" as const }],
      ]),
    };
    const reduced = makeUploadSnapshotFromCompletion({
      snapshot,
      response: {
        file,
        progress: {
          ...detail.progress,
          waitingCount: 263,
          doneCount: 1,
          doneBytes: 1000,
        },
        sessionState: "uploading",
        didSettle: false,
      },
    });
    expect(reduced.filesById.get(file.fileId)).toBe(localFile);
    expect(reduced.fileActivityById.get(file.fileId)).toEqual({
      kind: "confirmed",
      state: "done",
    });
    expect(snapshot.filesById.get(file.fileId)).toBe(localFile);
    expect(snapshot.fileActivityById.get(file.fileId)).toEqual({
      kind: "preparing",
    });
    expect(reduced.fileActivityById).not.toBe(snapshot.fileActivityById);
  });

  it("late completion cannot regress confirmed progress", () => {
    const detail = makeUploadSurfaceDetail({ state: "settled" });
    detail.progress = {
      ...detail.progress,
      waitingCount: 0,
      doneCount: 262,
      failedCount: 2,
      doneBytes: 262000,
    };
    const file = { ...detail.files[0]!, state: "done" as const };
    const reduced = makeUploadSnapshotFromCompletion({
      snapshot: makeUploadSnapshotFromDetail(detail),
      response: {
        file,
        progress: {
          ...detail.progress,
          doneCount: 1,
          doneBytes: 1000,
          failedCount: 0,
          waitingCount: 263,
        },
        sessionState: "uploading",
        didSettle: false,
      },
    });
    expect(reduced.detail?.progress).toMatchObject({
      doneCount: 262,
      doneBytes: 262000,
    });
    expect(reduced.detail?.state).toBe("settled");
    expect(reduced.detail?.files[0]?.state).toBe("done");
    expect(detail.files[0]?.state).toBe("waiting");
  });

  it("a fresh retry baseline accepts fewer terminal files", () => {
    const detail = makeUploadSurfaceDetail({ state: "settled" });
    detail.progress = {
      ...detail.progress,
      waitingCount: 2,
      doneCount: 262,
      doneBytes: 262000,
    };
    const retryBaseline = makeUploadSnapshotFromCompletion({
      snapshot: makeUploadSnapshotFromDetail(detail),
      response: {
        file: { ...detail.files[262]!, state: "done" },
        progress: {
          ...detail.progress,
          waitingCount: 1,
          doneCount: 263,
          doneBytes: 263000,
        },
        sessionState: "settled",
        didSettle: false,
      },
    });
    expect(retryBaseline.detail?.progress.waitingCount).toBe(1);
  });

  it("a failed file response updates aggregate progress", () => {
    const detail = makeUploadSurfaceDetail({ state: "uploading" });
    const failedResult = makeUploadSnapshotFromCompletion({
      snapshot: makeUploadSnapshotFromDetail(detail),
      response: {
        file: {
          ...detail.files[0]!,
          state: "failed",
          problemCode: "connection_lost",
        },
        progress: { ...detail.progress, waitingCount: 263, failedCount: 1 },
        sessionState: "uploading",
        didSettle: false,
      },
    });
    expect(failedResult.detail?.progress.failedCount).toBe(1);
    expect(failedResult.detail?.files[0]?.state).toBe("failed");
  });

  it("settlement evidence survives an older aggregate", () => {
    const detail = makeUploadSurfaceDetail({ state: "uploading" });
    detail.progress = {
      ...detail.progress,
      waitingCount: 0,
      doneCount: 264,
      doneBytes: 264000,
    };
    const reduced = makeUploadSnapshotFromCompletion({
      snapshot: makeUploadSnapshotFromDetail(detail),
      response: {
        file: { ...detail.files[0]!, state: "done" },
        progress: { ...detail.progress, doneCount: 263, waitingCount: 1 },
        sessionState: "settled",
        didSettle: true,
      },
    });
    expect(reduced.detail?.state).toBe("settled");
    expect(reduced.detail?.progress.doneCount).toBe(264);
  });

  it("gets all eligible day files beyond the first page", () => {
    const detail = makeUploadSurfaceDetail();
    detail.files[110] = { ...detail.files[110]!, state: "refused" };
    detail.files[111] = { ...detail.files[111]!, state: "cancelled" };
    const files = getDayFilesFromSnapshot({
      snapshot: makeUploadSnapshotFromDetail(detail),
      capturedOn: "2026-10-02",
    });
    expect(files).toHaveLength(162);
    expect(files.at(-1)?.position).toBe(263);
    expect(
      files.some((file) => {
        return file.state === "refused" || file.state === "cancelled";
      }),
    ).toBe(false);
  });
});
