import type { ManifestOutcome } from "@memory-shoebox/shared";
import type { UploadEngineEvent } from "@/upload/createUploadEngine/createUploadEngine";
import type {
  UploadProofFile,
  UploadProofPhase,
} from "@/upload/proof/uploadProofReport/uploadProofReport";

/*
 * The harness's one piece of state, published as `window.__uploadProof` and
 * mutated in place as a run goes, so a Playwright spec or `pnpm upload:proof`
 * can read where it is at any moment. No file's contents are ever in it, only
 * names, sizes, types, timings and the server's answers.
 */

/**
 * The state as the page publishes it.
 *
 * `outcomes` and `events` are the contract Task 31's spec reads; the rest is
 * what `pnpm upload:proof` summarises. `release` is a function only while
 * `held`, and null otherwise.
 */
export type UploadProofState = {
  phase: UploadProofPhase;
  sessionId: string | null;
  isResume: boolean;
  outcomes: ManifestOutcome[];
  events: UploadEngineEvent[];
  error: string | null;
  release: (() => void) | null;
  concurrency: number;
  userAgent: string;
  wallMs: number | null;
  /** `performance.memory`, which only Chrome has. Null elsewhere. */
  jsHeapPeakBytes: number | null;
  files: UploadProofFile[];
};

/** The state before anything has been picked. */
export function makeIdleUploadProofState(
  options: Readonly<{ concurrency: number; userAgent: string }>,
): UploadProofState {
  return {
    phase: "idle",
    sessionId: null,
    isResume: false,
    outcomes: [],
    events: [],
    error: null,
    release: null,
    concurrency: options.concurrency,
    userAgent: options.userAgent,
    wallMs: null,
    jsHeapPeakBytes: null,
    files: [],
  };
}

/** One file's clock, filled in by the engine's events. */
export type ProofTiming = {
  startedAt: number;
  firstByteAt: number | null;
  endedAt: number | null;
  outcome: "done" | "failed" | "skipped" | null;
  problemCode: string | null;
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
      firstByteAt: null,
      endedAt: null,
      outcome: null,
      problemCode: null,
      hasMedia: false,
    });
    return;
  }
  const timing =
    event.kind === "settled" ? undefined : timings.get(event.fileId);
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
  timing: ProofTiming | undefined;
};

/** One file's row, from what the manifest said and what its clock read. */
export function makeUploadProofFileFromFacts(
  facts: Readonly<ProofFileFacts>,
): UploadProofFile {
  const { outcome, timing } = facts;
  const firstByteAt = timing?.firstByteAt ?? null;
  const endedAt = timing?.endedAt ?? null;
  const startedAt = timing?.startedAt ?? null;
  return {
    name: facts.file.name,
    contentType: facts.contentType,
    bytes: facts.file.size,
    outcome:
      outcome.disposition === "refused" ||
      outcome.disposition === "already_done"
        ? outcome.disposition
        : (timing?.outcome ?? "not_sent"),
    problemCode: timing?.problemCode ?? outcome.problemCode,
    prepareMs:
      startedAt === null || firstByteAt === null
        ? null
        : firstByteAt - startedAt,
    transferMs:
      firstByteAt === null || endedAt === null ? null : endedAt - firstByteAt,
    totalMs:
      startedAt === null || endedAt === null ? null : endedAt - startedAt,
    hasMedia: timing?.hasMedia ?? false,
  };
}
