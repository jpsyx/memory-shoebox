import type {
  CompleteUploadFileResponse,
  ManifestEntry,
  ManifestOutcome,
} from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { makeJpegBytesFromExif } from "@/testing/mediaBytes";
import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type {
  UploadEngineEvent,
  UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine";
import {
  getConcurrencyFromSearch,
  getHoldFromSearch,
  getPendingFilesFromOutcomes,
  makeBatchesFromItems,
  runUploadProof,
  type UploadProofApi,
  type UploadProofDependencies,
} from "@/upload/proof/runUploadProof/runUploadProof";
import { makeIdleUploadProofState } from "@/upload/proof/uploadProofState/uploadProofState";

const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";

/** A file id for the nth declared file. */
function _fileId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

/** Three picks: two photographs and a PDF the server will refuse. */
function _picks(): File[] {
  const jpeg = makeJpegBytesFromExif(undefined);
  return [
    new File([jpeg], "a.jpg", { type: "image/jpeg" }),
    new File([jpeg], "b.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array([0x25, 0x50])], "menu.pdf", {
      type: "application/pdf",
    }),
  ];
}

/** The outcome the fake manifest gives an entry. */
function _outcomeOf(entry: ManifestEntry): ManifestOutcome {
  const isRefused = entry.declaredContentType === "application/pdf";
  return {
    clientRef: entry.clientRef,
    fileId: _fileId(Number(entry.clientRef) + 1),
    disposition: isRefused ? "refused" : "created",
    state: isRefused ? "refused" : "waiting",
    capturedOn: null,
    captureSource: null,
    problemCode: isRefused ? "unsupported_type" : null,
  };
}

/** An API with a session of the given state, or none at all. */
function _fakeApi(
  current: "none" | "draft" | "uploading",
): UploadProofApi & Record<keyof UploadProofApi, ReturnType<typeof vi.fn>> {
  return {
    getCurrentUploadSession: vi.fn(async () => {
      return current === "none"
        ? null
        : makeUploadSessionDetail({ sessionId: SESSION_ID, state: current });
    }),
    openUploadSession: vi.fn(async () => {
      return makeUploadSessionDetail({ sessionId: SESSION_ID });
    }),
    putUploadManifest: vi.fn(async (options) => {
      return {
        sessionId: SESSION_ID,
        fileCount: 3,
        totalBytes: 0,
        outcomes: options.files.map(_outcomeOf),
      };
    }),
    commitUploadSession: vi.fn(async () => {
      return makeUploadSessionDetail({
        sessionId: SESSION_ID,
        state: "uploading",
      });
    }),
  };
}

/** What `complete` answers for one landed file. */
function _doneResponse(item: UploadEngineFile): CompleteUploadFileResponse {
  return {
    file: {
      fileId: item.fileId,
      position: 0,
      originalFilename: item.file.name,
      declaredContentType: item.file.type,
      declaredBytes: item.file.size,
      contentHash: null,
      state: "done",
      attemptCount: 1,
      problemCode: null,
      problemDetail: null,
      capturedAt: null,
      capturedOn: null,
      captureOffsetMinutes: null,
      captureSource: null,
      itemId: null,
      media: null,
    },
    progress: makeUploadSessionDetail().progress,
    sessionState: "settled",
    didSettle: false,
  };
}

/** An engine that lands every file it is given, one after the other. */
function _fakeEngine(
  sent: UploadEngineFile[][],
): UploadProofDependencies["createEngine"] {
  return (options) => {
    return {
      start: async (files) => {
        sent.push([...files]);
        files.forEach((item) => {
          const response = _doneResponse(item);
          const events: UploadEngineEvent[] = [
            { kind: "file-started", fileId: item.fileId },
            {
              kind: "file-progress",
              fileId: item.fileId,
              sentBytes: 1,
              totalBytes: 1,
            },
            { kind: "file-done", fileId: item.fileId, response },
          ];
          events.forEach(options.onEvent);
        });
        options.onEvent({ kind: "settled", sessionState: "settled" });
      },
      cancel: () => {},
    };
  };
}

/** A clock that moves 10 ms every time it is read. */
function _tickingClock(): () => number {
  let now = 0;
  return () => {
    now += 10;
    return now;
  };
}

describe("runUploadProof", () => {
  it("opens a draft, declares in batches, commits, and sends only what is pending", async () => {
    const api = _fakeApi("none");
    const sent: UploadEngineFile[][] = [];
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: _picks(),
      hold: null,
      batchSize: 2,
      dependencies: {
        api,
        createEngine: _fakeEngine(sent),
        now: _tickingClock(),
        readHeapBytes: () => {
          return null;
        },
      },
    });

    expect(api.openUploadSession).toHaveBeenCalledTimes(1);
    expect(
      api.putUploadManifest.mock.calls.map(([call]) => {
        return call.files.map((entry: ManifestEntry) => {
          return entry.clientRef;
        });
      }),
    ).toEqual([["0", "1"], ["2"]]);
    expect(api.commitUploadSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      intent: "arm",
    });
    expect(
      sent[0]?.map((item) => {
        return item.file.name;
      }),
    ).toEqual(["a.jpg", "b.jpg"]);
    expect(state.phase).toBe("finished");
    expect(state.isResume).toBe(false);
    expect(state.events.at(-1)).toEqual({
      kind: "settled",
      sessionState: "settled",
    });
    expect(
      state.files.map((file) => {
        return [file.name, file.outcome];
      }),
    ).toEqual([
      ["a.jpg", "done"],
      ["b.jpg", "done"],
      ["menu.pdf", "refused"],
    ]);
  });

  it("reuses a draft rather than opening another", async () => {
    const api = _fakeApi("draft");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: _picks(),
      hold: null,
      dependencies: { api, createEngine: _fakeEngine([]) },
    });

    expect(api.openUploadSession).not.toHaveBeenCalled();
    expect(api.commitUploadSession).toHaveBeenCalledTimes(1);
  });

  it("resumes an uploading batch: every entry carries its hash, and nothing commits", async () => {
    const api = _fakeApi("uploading");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: _picks().slice(0, 1),
      hold: null,
      dependencies: { api, createEngine: _fakeEngine([]) },
    });

    expect(state.isResume).toBe(true);
    expect(api.commitUploadSession).not.toHaveBeenCalled();
    expect(
      api.putUploadManifest.mock.calls[0]?.[0].files[0].contentHash,
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it("holds before commit until released, then carries on", async () => {
    const api = _fakeApi("none");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    const running = runUploadProof({
      state,
      files: _picks(),
      hold: "before-commit",
      dependencies: { api, createEngine: _fakeEngine([]) },
    });
    await vi.waitFor(() => {
      expect(state.phase).toBe("held");
    });

    expect(api.commitUploadSession).not.toHaveBeenCalled();
    state.release?.();
    await running;

    expect(api.commitUploadSession).toHaveBeenCalledTimes(1);
    expect(state.release).toBeNull();
    expect(state.phase).toBe("finished");
  });

  it("ends failed, with the error, rather than rejecting", async () => {
    const api = _fakeApi("none");
    api.putUploadManifest.mockRejectedValueOnce(new Error("Manifest refused"));
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: _picks(),
      hold: null,
      dependencies: { api, createEngine: _fakeEngine([]) },
    });

    expect(state.phase).toBe("failed");
    expect(state.error).toBe("Manifest refused");
  });
});

describe("the URL and the batches", () => {
  it("reads the concurrency, falling back to the configured two", () => {
    expect(getConcurrencyFromSearch("?concurrency=1")).toBe(1);
    expect(getConcurrencyFromSearch("?concurrency=40")).toBe(2);
    expect(getConcurrencyFromSearch("")).toBe(2);
  });

  it("reads the hold", () => {
    expect(getHoldFromSearch("?hold=before-commit")).toBe("before-commit");
    expect(getHoldFromSearch("?hold=later")).toBeNull();
  });

  it("cuts a selection into manifest-sized batches", () => {
    expect(makeBatchesFromItems([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(makeBatchesFromItems([], 500)).toEqual([]);
  });

  it("sends neither a refused file nor one already up", () => {
    const files = _picks();
    const entry = (clientRef: string, type: string): ManifestEntry => {
      return {
        clientRef,
        originalFilename: clientRef,
        declaredContentType: type,
        declaredBytes: 1,
      };
    };
    const outcomes: ManifestOutcome[] = [
      {
        ..._outcomeOf(entry("0", "image/jpeg")),
        disposition: "already_done",
        state: "done",
      },
      _outcomeOf(entry("1", "image/jpeg")),
      _outcomeOf(entry("2", "application/pdf")),
    ];

    expect(
      getPendingFilesFromOutcomes({ files, outcomes }).map((item) => {
        return [item.fileId, item.file.name];
      }),
    ).toEqual([[_fileId(2), "b.jpg"]]);
  });
});
