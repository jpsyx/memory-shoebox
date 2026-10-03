import type { ManifestOutcome } from "@memory-shoebox/shared";
import type { UploadEngineEvent } from "@/upload/createUploadEngine/createUploadEngine.types";
import type {
  UploadProofFile,
  UploadProofPhase,
} from "@/upload/proof/uploadProofReport.constants";

/*
 * The harness's one piece of state, published as `window.__uploadProof` and
 * mutated in place as a run goes, so a Playwright spec or `pnpm upload:proof`
 * can read where it is at any moment. No file's contents are ever in it, only
 * names, sizes, types, timings and the server's answers.
 */

/**
 * The state as the page publishes it.
 *
 * `outcomes` and `events` are read by the end-to-end upload spec; the rest is
 * what `pnpm upload:proof` summarises. `release` is a function only while
 * `held`, and undefined otherwise.
 */
export type UploadProofState = {
  phase: UploadProofPhase;
  sessionId: string | undefined;
  isResume: boolean;
  outcomes: ManifestOutcome[];
  events: UploadEngineEvent[];
  error: string | undefined;
  release: (() => void) | undefined;
  concurrency: number;
  userAgent: string;
  wallMs: number | undefined;
  /**
   * `performance.memory`, which only Chrome has. Undefined elsewhere. Coarse
   * without `--enable-precise-memory-info`, and the main thread's heap only.
   */
  jsHeapPeakBytes: number | undefined;
  files: UploadProofFile[];
};

/** The state before anything has been picked. */
export function makeIdleUploadProofState(
  options: Readonly<{ concurrency: number; userAgent: string }>,
): UploadProofState {
  return {
    phase: "idle",
    sessionId: undefined,
    isResume: false,
    outcomes: [],
    events: [],
    error: undefined,
    release: undefined,
    concurrency: options.concurrency,
    userAgent: options.userAgent,
    wallMs: undefined,
    jsHeapPeakBytes: undefined,
    files: [],
  };
}

/** One file's clock, filled in by the engine's events. */
export type ProofTiming = {
  startedAt: number;
  firstByteAt: number | undefined;
  endedAt: number | undefined;
  outcome: "done" | "failed" | "skipped" | undefined;
  problemCode: string | undefined;
  hasMedia: boolean;
};

/**
 * Advances the timings by one engine event. Mutates `timings`.
 *
 * `file-started` opens a file's clock, its first `file-progress` marks the
 * first byte, and its `file-done`, `file-failed` or `file-skipped` stops it.
 */
export function recordUploadProofEvent(
  options: Readonly<{
    timings: Map<string, ProofTiming>;
    event: UploadEngineEvent;
    now: number;
  }>,
): void {
  const { event, now, timings } = options;
  if (event.kind === "file-started") {
    timings.set(event.fileId, {
      startedAt: now,
      firstByteAt: undefined,
      endedAt: undefined,
      outcome: undefined,
      problemCode: undefined,
      hasMedia: false,
    });
    return;
  }
  const timing = "fileId" in event ? timings.get(event.fileId) : undefined;
  if (timing === undefined) {
    return;
  }
  if (event.kind === "file-progress") {
    timing.firstByteAt ??= now;
  } else if (event.kind === "file-done") {
    timing.endedAt = now;
    timing.outcome = "done";
    timing.hasMedia = event.response.file.media !== null;
  } else if (event.kind === "file-failed") {
    timing.endedAt = now;
    timing.outcome = "failed";
    timing.problemCode = event.problemCode;
  } else if (event.kind === "file-skipped") {
    timing.endedAt = now;
    timing.outcome = "skipped";
  }
}

/** A picked file, what the manifest said of it, and its clock if it ran. */
export type ProofFileFacts = {
  file: Pick<File, "name" | "size">;
  contentType: string;
  outcome: ManifestOutcome;
  /**
   * Whether the manifest matched this pick to the file id of an earlier pick
   * (byte-identical bytes), so only that earlier pick was sent. The row is
   * `skipped` and carries no clock: the shared one is the first pick's.
   */
  isTwin?: boolean;
  timing: ProofTiming | undefined;
};

/** How a picked file ended: the manifest's word, else its clock's. */
function _getFileOutcomeFromFacts(
  functionOptions: Readonly<{
    facts: Readonly<ProofFileFacts>;
    timing: ProofTiming | undefined;
  }>,
): UploadProofFile["outcome"] {
  const { facts, timing } = functionOptions;

  const { disposition } = facts.outcome;
  return facts.isTwin === true
    ? "skipped"
    : disposition === "refused" || disposition === "already_done"
      ? disposition
      : (timing?.outcome ?? "not_sent");
}

/** One file's row, from what the manifest said and what its clock read. */
export function makeUploadProofFileFromFacts(
  facts: Readonly<ProofFileFacts>,
): UploadProofFile {
  const { outcome } = facts;
  const timing = facts.isTwin === true ? undefined : facts.timing;
  const firstByteAt = timing?.firstByteAt ?? undefined;
  const endedAt = timing?.endedAt ?? undefined;
  const startedAt = timing?.startedAt ?? undefined;
  return {
    name: facts.file.name,
    contentType: facts.contentType,
    bytes: facts.file.size,
    outcome: _getFileOutcomeFromFacts({ facts: facts, timing: timing }),
    problemCode: timing?.problemCode ?? outcome.problemCode,
    prepareMs:
      startedAt === undefined || firstByteAt === undefined
        ? null
        : firstByteAt - startedAt,
    transferMs:
      firstByteAt === undefined || endedAt === undefined
        ? null
        : endedAt - firstByteAt,
    totalMs:
      startedAt === undefined || endedAt === undefined
        ? null
        : endedAt - startedAt,
    hasMedia: timing?.hasMedia ?? false,
  };
}
