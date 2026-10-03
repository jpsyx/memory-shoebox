import {
  SESSION_ID,
  createFilePicks,
  createJpegPicks,
  createFakeUploadApi,
  setManifestTwinAnswers,
  makeFakeEngineFromOptions,
} from "./runUploadProofTestHelpers";
import type { ManifestEntry } from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";

import { makeUploadSessionDetail } from "@/testing/makeUploadSessionDetail";
import type { UploadEngineFile } from "@/upload/createUploadEngine/createUploadEngine.types";

import { runUploadProof } from "@/upload/proof/runUploadProof/runUploadProof";

import { makeIdleUploadProofState } from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

describe("runUploadProof", () => {
  it("opens a draft, declares in batches, commits, and sends only what is pending", async () => {
    const api = createFakeUploadApi("none");
    const sent: UploadEngineFile[][] = [];
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createFilePicks(),
      hold: undefined,
      batchSize: 2,
      dependencies: {
        api,
        createEngine: makeFakeEngineFromOptions(sent),
        now: ((): (() => number) => {
          let now = 0;
          return () => {
            now += 10;
            return now;
          };
        })(),
        readHeapBytes: () => {
          return undefined;
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
    const api = createFakeUploadApi("draft");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createFilePicks(),
      hold: undefined,
      dependencies: { api, createEngine: makeFakeEngineFromOptions([]) },
    });

    expect(api.openUploadSession).not.toHaveBeenCalled();
    expect(api.commitUploadSession).toHaveBeenCalledTimes(1);
  });

  it("resumes an uploading batch: every entry carries its hash, and nothing commits", async () => {
    const api = createFakeUploadApi("uploading");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createFilePicks().slice(0, 1),
      hold: undefined,
      dependencies: { api, createEngine: makeFakeEngineFromOptions([]) },
    });

    expect(state.isResume).toBe(true);
    expect(api.commitUploadSession).not.toHaveBeenCalled();
    expect(
      api.putUploadManifest.mock.calls[0]?.[0].files[0].contentHash,
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it("holds before commit until released, then carries on", async () => {
    const api = createFakeUploadApi("none");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    const running = runUploadProof({
      state,
      files: createFilePicks(),
      hold: "before-commit",
      dependencies: { api, createEngine: makeFakeEngineFromOptions([]) },
    });
    await vi.waitFor(() => {
      expect(state.phase).toBe("held");
    });

    expect(api.commitUploadSession).not.toHaveBeenCalled();
    state.release?.();
    expect(state.phase).toBe("declaring");
    expect(state.release).toBeUndefined();
    await running;

    expect(api.commitUploadSession).toHaveBeenCalledTimes(1);
    expect(state.release).toBeUndefined();
    expect(state.phase).toBe("finished");
  });

  it("is declaring while it commits and transferring while it sends, held or not", async () => {
    const api = createFakeUploadApi("none");
    const phases: string[] = [];
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });
    api.commitUploadSession.mockImplementation(async () => {
      phases.push(state.phase);
      return makeUploadSessionDetail({
        sessionId: SESSION_ID,
        state: "uploading",
      });
    });
    const makeEngine = makeFakeEngineFromOptions([]);

    const running = runUploadProof({
      state,
      files: createFilePicks(),
      hold: "before-commit",
      dependencies: {
        api,
        createEngine: (options) => {
          const engine = makeEngine(options);
          return {
            ...engine,
            start: async (files) => {
              phases.push(state.phase);
              await engine.start(files);
            },
          };
        },
      },
    });
    await vi.waitFor(() => {
      expect(state.phase).toBe("held");
    });
    state.release?.();
    await running;

    expect(phases).toEqual(["declaring", "transferring"]);
  });

  it("hashes one file at a time on a resume, never all of a batch at once", async () => {
    const api = createFakeUploadApi("uploading");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });
    let hashesInFlight = 0;
    let mostHashesInFlight = 0;
    const makeSha256HexFromBlob = vi.fn(async () => {
      hashesInFlight += 1;
      mostHashesInFlight = Math.max(mostHashesInFlight, hashesInFlight);
      await new Promise((settle) => {
        setTimeout(settle, 1);
      });
      hashesInFlight -= 1;
      return "ab".repeat(32);
    });

    await runUploadProof({
      state,
      files: createJpegPicks(6),
      hold: undefined,
      dependencies: {
        api,
        createEngine: makeFakeEngineFromOptions([]),
        makeSha256HexFromBlob,
      },
    });

    expect(makeSha256HexFromBlob).toHaveBeenCalledTimes(6);
    expect(mostHashesInFlight).toBe(1);
    expect(
      api.putUploadManifest.mock.calls[0]?.[0].files.map(
        (entry: ManifestEntry) => {
          return entry.contentHash;
        },
      ),
    ).toEqual(
      Array.from({ length: 6 }, () => {
        return "ab".repeat(32);
      }),
    );
  });

  it("sends a byte-identical twin once, and reports the twin as skipped", async () => {
    const api = createFakeUploadApi("uploading");
    setManifestTwinAnswers({ api: api, twinOf: { "1": "0" } });
    const sent: UploadEngineFile[][] = [];
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createJpegPicks(3),
      hold: undefined,
      dependencies: { api, createEngine: makeFakeEngineFromOptions(sent) },
    });

    expect(
      sent[0]?.map((item) => {
        return item.file.name;
      }),
    ).toEqual(["p0.jpg", "p2.jpg"]);
    expect(
      state.events.filter((event) => {
        return event.kind === "file-done";
      }),
    ).toHaveLength(2);
    expect(
      state.files.map((file) => {
        return [file.name, file.outcome, file.totalMs === null];
      }),
    ).toEqual([
      ["p0.jpg", "done", false],
      ["p1.jpg", "skipped", true],
      ["p2.jpg", "done", false],
    ]);
  });

  it("sends a twin once when its file id was already matched by an earlier batch", async () => {
    const api = createFakeUploadApi("uploading");
    setManifestTwinAnswers({ api: api, twinOf: { "2": "0" } });
    const sent: UploadEngineFile[][] = [];
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createJpegPicks(3),
      hold: undefined,
      batchSize: 2,
      dependencies: { api, createEngine: makeFakeEngineFromOptions(sent) },
    });

    expect(api.putUploadManifest).toHaveBeenCalledTimes(2);
    expect(
      sent[0]?.map((item) => {
        return item.file.name;
      }),
    ).toEqual(["p0.jpg", "p1.jpg"]);
    expect(
      state.files.map((file) => {
        return file.outcome;
      }),
    ).toEqual(["done", "done", "skipped"]);
  });
});
