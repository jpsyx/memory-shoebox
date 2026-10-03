import { describe, expect, it } from "vitest";
import type {
  UploadProofFile,
  UploadProofReport,
} from "../../apps/web/src/upload/proof/uploadProofReport/uploadProofReport";
import {
  getMedianFromValues,
  makeDurationLabelFromMs,
  makeSummaryLinesFromReport,
} from "./uploadProofSummary";

/** One file's row, done in `totalMs` unless the test says otherwise. */
function _file(
  overrides: Partial<UploadProofFile> & Pick<UploadProofFile, "name">,
): UploadProofFile {
  return {
    contentType: "image/heic",
    bytes: 1,
    outcome: "done",
    problemCode: null,
    prepareMs: null,
    transferMs: null,
    totalMs: 400,
    hasMedia: true,
    ...overrides,
  };
}

const REPORT: UploadProofReport = {
  phase: "finished",
  sessionId: "018f0000-0000-7000-8000-00000000c001",
  isResume: false,
  error: null,
  concurrency: 2,
  userAgent: "Chrome 154",
  wallMs: 25_900,
  jsHeapPeakBytes: 812 * 1024 ** 2,
  files: [
    _file({ name: "a.heic", totalMs: 300 }),
    _file({ name: "b.heic", totalMs: 500 }),
    _file({ name: "c.jpg", contentType: "image/jpeg", totalMs: 2100 }),
    _file({ name: "d.mov", contentType: "video/quicktime", totalMs: 9800 }),
    _file({
      name: "e.mov",
      contentType: "video/quicktime",
      outcome: "failed",
      problemCode: "storage_rejected",
      totalMs: 100,
    }),
    _file({
      name: "menu.pdf",
      contentType: "application/pdf",
      outcome: "refused",
      problemCode: "unsupported_type",
      totalMs: null,
    }),
  ],
};

describe("getMedianFromValues", () => {
  it("takes the middle, the lower middle of an even count, and null of none", () => {
    expect(getMedianFromValues([3, 1, 2])).toBe(2);
    expect(getMedianFromValues([4, 1, 3, 2])).toBe(2);
    expect(getMedianFromValues([])).toBeNull();
  });
});

describe("makeDurationLabelFromMs", () => {
  it("says milliseconds under a second and seconds from there", () => {
    expect(makeDurationLabelFromMs(383.4)).toBe("383 ms");
    expect(makeDurationLabelFromMs(25_900)).toBe("25.9 s");
  });
});

describe("makeSummaryLinesFromReport", () => {
  it("prints the session, the counts, the time, the medians, the memory and the casualties", () => {
    expect(
      makeSummaryLinesFromReport({
        report: REPORT,
        memory: { baselineKb: 210 * 1024, peakKb: 1234 * 1024 },
      }),
    ).toEqual([
      "Session: 018f0000-0000-7000-8000-00000000c001 (finished)",
      "Browser: Chrome 154, 2 at a time",
      "Files: 6 picked, 4 done, 1 refused, 1 failed, 0 skipped as duplicates, 0 already up, 0 not sent",
      "Wall time: 25.9 s",
      "Photos: 3 done, median 500 ms each, slowest 2.1 s",
      "Videos: 1 done, median 9.8 s each, slowest 9.8 s",
      "Peak memory over baseline: 1024 MB (browser RSS 1234 MB, baseline 210 MB)",
      "Peak JS heap: 812 MB",
      "  failed: e.mov storage_rejected",
    ]);
  });

  it("says so when no memory could be measured and when a run failed", () => {
    const lines = makeSummaryLinesFromReport({
      report: {
        ...REPORT,
        phase: "failed",
        error: "Manifest refused",
        jsHeapPeakBytes: null,
        files: [],
      },
      memory: null,
    });

    expect(lines).toContain(
      "Peak memory over baseline: not measured on this platform",
    );
    expect(lines).toContain("Peak JS heap: not reported by this browser");
    expect(lines).toContain("Error: Manifest refused");
    expect(lines).toContain("Photos: none done");
  });
});
