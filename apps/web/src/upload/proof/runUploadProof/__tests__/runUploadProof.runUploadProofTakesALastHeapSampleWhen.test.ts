import {
  makeFileIdFromIndex,
  createFilePicks,
  createJpegPicks,
  makeManifestOutcomeFromEntry,
  createFakeUploadApi,
  makeFakeEngineFromOptions,
} from "./runUploadProofTestHelpers";
import type { ManifestEntry, ManifestOutcome } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";

import {
  getConcurrencyFromSearch,
  getHoldFromSearch,
  getPendingFilesFromOutcomes,
  makeBatchesFromItems,
} from "@/upload/proof/runUploadProof/uploadProofInputHelpers";
import { runUploadProof } from "@/upload/proof/runUploadProof/runUploadProof";

import { makeIdleUploadProofState } from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

describe("runUploadProof", () => {
  it("takes a last heap sample when the run ends, so a short run still has a peak", async () => {
    const api = createFakeUploadApi("none");
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });
    let readCount = 0;

    await runUploadProof({
      state,
      files: createFilePicks(),
      hold: undefined,
      dependencies: {
        api,
        createEngine: makeFakeEngineFromOptions([]),
        readHeapBytes: () => {
          readCount += 1;
          return readCount === 1 ? 100 : 900;
        },
      },
    });

    expect(state.jsHeapPeakBytes).toBe(900);
  });

  it("ends failed, with the error, rather than rejecting", async () => {
    const api = createFakeUploadApi("none");
    api.putUploadManifest.mockRejectedValueOnce(new Error("Manifest refused"));
    const state = makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" });

    await runUploadProof({
      state,
      files: createFilePicks(),
      hold: undefined,
      dependencies: { api, createEngine: makeFakeEngineFromOptions([]) },
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

  it("returns before-commit for that hold query and null for an unknown hold", () => {
    expect(getHoldFromSearch("?hold=before-commit")).toBe("before-commit");
    expect(getHoldFromSearch("?hold=later")).toBeUndefined();
  });

  it("cuts a selection into manifest-sized batches", () => {
    expect(makeBatchesFromItems({ items: [1, 2, 3, 4, 5], size: 2 })).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(makeBatchesFromItems({ items: [], size: 500 })).toEqual([]);
  });

  it("sends neither a refused file nor one already up", () => {
    const files = createFilePicks();
    const entry = (
      functionOptions: Readonly<{ clientRef: string; type: string }>,
    ): ManifestEntry => {
      const { clientRef, type } = functionOptions;

      return {
        clientRef,
        originalFilename: clientRef,
        declaredContentType: type,
        declaredBytes: 1,
      };
    };
    const outcomes: ManifestOutcome[] = [
      {
        ...makeManifestOutcomeFromEntry(
          entry({ clientRef: "0", type: "image/jpeg" }),
        ),
        disposition: "already_done",
        state: "done",
      },
      makeManifestOutcomeFromEntry(
        entry({ clientRef: "1", type: "image/jpeg" }),
      ),
      makeManifestOutcomeFromEntry(
        entry({ clientRef: "2", type: "application/pdf" }),
      ),
    ];

    expect(
      getPendingFilesFromOutcomes({ files, outcomes }).map((item) => {
        return [item.fileId, item.file.name];
      }),
    ).toEqual([[makeFileIdFromIndex(2), "b.jpg"]]);
  });

  it("keeps the first pick of each file id, wherever its twin falls", () => {
    const files = createJpegPicks(3);
    const entry = (clientRef: string): ManifestEntry => {
      return {
        clientRef,
        originalFilename: clientRef,
        declaredContentType: "image/jpeg",
        declaredBytes: 1,
      };
    };
    const outcomes: ManifestOutcome[] = [
      makeManifestOutcomeFromEntry(entry("0")),
      {
        ...makeManifestOutcomeFromEntry(entry("1")),
        fileId: makeFileIdFromIndex(1),
      },
      makeManifestOutcomeFromEntry(entry("2")),
    ];

    expect(
      getPendingFilesFromOutcomes({ files, outcomes }).map((item) => {
        return item.file.name;
      }),
    ).toEqual(["p0.jpg", "p2.jpg"]);
  });
});
