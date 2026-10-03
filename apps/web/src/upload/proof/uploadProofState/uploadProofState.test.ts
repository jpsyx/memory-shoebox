import type { ManifestOutcome } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  makeIdleUploadProofState,
  makeUploadProofFileFromFacts,
  recordUploadProofEvent,
  type ProofTiming,
} from "@/upload/proof/uploadProofState/uploadProofState";

const FILE_ID = "018f0000-0000-7000-8000-00000000f001";

/** A manifest outcome with the disposition a test is about. */
function _outcome(
  disposition: ManifestOutcome["disposition"],
): ManifestOutcome {
  return {
    clientRef: "0",
    fileId: FILE_ID,
    disposition,
    state: disposition === "refused" ? "refused" : "waiting",
    capturedOn: null,
    captureSource: null,
    problemCode: disposition === "refused" ? "unsupported_type" : null,
  };
}

const PDF = { name: "menu.pdf", size: 4 };

describe("makeIdleUploadProofState", () => {
  it("starts idle with nothing recorded", () => {
    expect(
      makeIdleUploadProofState({ concurrency: 2, userAgent: "UA" }),
    ).toEqual({
      phase: "idle",
      sessionId: null,
      isResume: false,
      outcomes: [],
      events: [],
      error: null,
      release: null,
      concurrency: 2,
      userAgent: "UA",
      wallMs: null,
      jsHeapPeakBytes: null,
      files: [],
    });
  });
});

describe("recordUploadProofEvent", () => {
  it("opens a clock on start, marks the first byte once, and stops it at the end", () => {
    const timings = new Map<string, ProofTiming>();

    recordUploadProofEvent({
      timings,
      event: { kind: "file-started", fileId: FILE_ID },
      now: 100,
    });
    [250, 400].forEach((now) => {
      recordUploadProofEvent({
        timings,
        event: {
          kind: "file-progress",
          fileId: FILE_ID,
          sentBytes: 1,
          totalBytes: 2,
        },
        now,
      });
    });
    recordUploadProofEvent({
      timings,
      event: {
        kind: "file-failed",
        fileId: FILE_ID,
        problemCode: "storage_rejected",
        detail: "Storage answered 400",
      },
      now: 900,
    });

    expect(timings.get(FILE_ID)).toEqual({
      startedAt: 100,
      firstByteAt: 250,
      endedAt: 900,
      outcome: "failed",
      problemCode: "storage_rejected",
      hasMedia: false,
    });
  });

  it("stops the clock on a skip, as skipped", () => {
    const timings = new Map<string, ProofTiming>();

    recordUploadProofEvent({
      timings,
      event: { kind: "file-started", fileId: FILE_ID },
      now: 100,
    });
    recordUploadProofEvent({
      timings,
      event: { kind: "file-skipped", fileId: FILE_ID, reason: "duplicate" },
      now: 180,
    });

    expect(timings.get(FILE_ID)).toMatchObject({
      endedAt: 180,
      outcome: "skipped",
      firstByteAt: null,
    });
  });

  it("ignores an event for a file it never saw start", () => {
    const timings = new Map<string, ProofTiming>();

    recordUploadProofEvent({
      timings,
      event: {
        kind: "file-progress",
        fileId: FILE_ID,
        sentBytes: 1,
        totalBytes: 2,
      },
      now: 5,
    });

    expect(timings.size).toBe(0);
  });
});

describe("makeUploadProofFileFromFacts", () => {
  it("splits a sent file's time into preparing and transferring", () => {
    expect(
      makeUploadProofFileFromFacts({
        file: { name: "IMG_0001.HEIC", size: 2048 },
        contentType: "image/heic",
        outcome: _outcome("created"),
        timing: {
          startedAt: 100,
          firstByteAt: 350,
          endedAt: 1350,
          outcome: "done",
          problemCode: null,
          hasMedia: true,
        },
      }),
    ).toEqual({
      name: "IMG_0001.HEIC",
      contentType: "image/heic",
      bytes: 2048,
      outcome: "done",
      problemCode: null,
      prepareMs: 250,
      transferMs: 1000,
      totalMs: 1250,
      hasMedia: true,
    });
  });

  it("reports what the manifest refused, with its code and no clock", () => {
    expect(
      makeUploadProofFileFromFacts({
        file: PDF,
        contentType: "application/pdf",
        outcome: _outcome("refused"),
        timing: undefined,
      }),
    ).toMatchObject({
      outcome: "refused",
      problemCode: "unsupported_type",
      prepareMs: null,
      transferMs: null,
      totalMs: null,
    });
  });

  it("reports a twin of another pick as skipped, with no clock of its own", () => {
    expect(
      makeUploadProofFileFromFacts({
        file: PDF,
        contentType: "image/jpeg",
        outcome: _outcome("matched"),
        isTwin: true,
        timing: {
          startedAt: 100,
          firstByteAt: 350,
          endedAt: 1350,
          outcome: "done",
          problemCode: null,
          hasMedia: true,
        },
      }),
    ).toMatchObject({
      outcome: "skipped",
      problemCode: null,
      prepareMs: null,
      transferMs: null,
      totalMs: null,
      hasMedia: false,
    });
  });

  it("reports a file the manifest found already up, and one that never ran", () => {
    expect(
      makeUploadProofFileFromFacts({
        file: PDF,
        contentType: "image/jpeg",
        outcome: _outcome("already_done"),
        timing: undefined,
      }).outcome,
    ).toBe("already_done");
    expect(
      makeUploadProofFileFromFacts({
        file: PDF,
        contentType: "image/jpeg",
        outcome: _outcome("matched"),
        timing: undefined,
      }).outcome,
    ).toBe("not_sent");
  });
});
