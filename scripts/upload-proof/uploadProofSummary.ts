import type {
  UploadProofFile,
  UploadProofReport,
} from "../../apps/web/src/upload/proof/uploadProofReport/uploadProofReport";
import type { BrowserMemory } from "./browserMemory";

/** The middle value, the lower of the two for an even count, or null. */
export function getMedianFromValues(values: readonly number[]): number | null {
  const sorted = [...values].sort((left, right) => {
    return left - right;
  });
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/** "383 ms" under a second, "25.9 s" from there. */
export function makeDurationLabelFromMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** One kind's line: how many landed, and the median and slowest of them. */
function _makeKindLine(
  label: string,
  files: readonly UploadProofFile[],
): string {
  const times = files.flatMap((file) => {
    return file.outcome === "done" && file.totalMs !== null
      ? [file.totalMs]
      : [];
  });
  const median = getMedianFromValues(times);
  const slowest = times.length === 0 ? null : Math.max(...times);
  return median === null || slowest === null
    ? `${label}: none done`
    : `${label}: ${times.length} done, median ${makeDurationLabelFromMs(median)} each, slowest ${makeDurationLabelFromMs(slowest)}`;
}

/** Kilobytes as whole megabytes. */
function _makeMegabytesFromKb(kb: number): string {
  return `${Math.round(kb / 1024)} MB`;
}

/** The two memory lines: the browser's processes, and the page's own heap. */
function _makeMemoryLines(
  options: Readonly<{
    memory: BrowserMemory | null;
    jsHeapPeakBytes: number | null;
  }>,
): string[] {
  const { memory } = options;
  return [
    memory === null
      ? "Peak memory over baseline: not measured on this platform"
      : `Peak memory over baseline: ${_makeMegabytesFromKb(memory.peakKb - memory.baselineKb)} (browser RSS ${_makeMegabytesFromKb(memory.peakKb)}, baseline ${_makeMegabytesFromKb(memory.baselineKb)})`,
    `Peak JS heap: ${options.jsHeapPeakBytes === null ? "not reported by this browser" : _makeMegabytesFromKb(options.jsHeapPeakBytes / 1024)}`,
  ];
}

/** How many files ended each way. */
function _makeCountsLine(files: readonly UploadProofFile[]): string {
  const countOf = (outcome: UploadProofFile["outcome"]): number => {
    return files.filter((file) => {
      return file.outcome === outcome;
    }).length;
  };
  return `Files: ${files.length} picked, ${countOf("done")} done, ${countOf("refused")} refused, ${countOf("failed")} failed, ${countOf("skipped")} skipped as duplicates, ${countOf("already_done")} already up, ${countOf("not_sent")} not sent`;
}

/**
 * The summary `pnpm upload:proof` prints: the session, the counts, the wall
 * time, the median per photo and per video, peak memory over baseline where
 * it could be measured, and every file that did not make it, by name and
 * problem code.
 *
 * Names only: it never prints what is in a file. The names stay on the
 * terminal, and the step's record (Task 33) keeps the figures, not them.
 */
export function makeSummaryLinesFromReport(
  options: Readonly<{
    report: UploadProofReport;
    memory: BrowserMemory | null;
  }>,
): string[] {
  const { report } = options;
  const photos = report.files.filter((file) => {
    return file.contentType.startsWith("image/");
  });
  const videos = report.files.filter((file) => {
    return file.contentType.startsWith("video/");
  });
  const failures = report.files.filter((file) => {
    return file.outcome === "failed" || file.outcome === "not_sent";
  });
  return [
    `Session: ${report.sessionId ?? "none"} (${report.phase}${report.isResume ? ", resumed" : ""})`,
    `Browser: ${report.userAgent}, ${report.concurrency} at a time`,
    _makeCountsLine(report.files),
    `Wall time: ${report.wallMs === null ? "unknown" : makeDurationLabelFromMs(report.wallMs)}`,
    _makeKindLine("Photos", photos),
    _makeKindLine("Videos", videos),
    ..._makeMemoryLines({
      memory: options.memory,
      jsHeapPeakBytes: report.jsHeapPeakBytes,
    }),
    ...(report.error === null ? [] : [`Error: ${report.error}`]),
    ...failures.map((file) => {
      return `  ${file.outcome}: ${file.name} ${file.problemCode ?? ""}`.trimEnd();
    }),
  ];
}
