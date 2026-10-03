import {
  UPLOAD_LIMITS,
  type ManifestEntry,
  type ManifestOutcome,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../../../app.config";
import {
  commitUploadSession,
  getCurrentUploadSession,
  openUploadSession,
  putUploadManifest,
} from "@/api/uploads/uploads";
import {
  createUploadEngine,
  type UploadEngineEvent,
  type UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine";
import {
  getDeclaredContentTypeFromFile,
  getManifestEntryFromFile,
} from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";
import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";
import type { UploadProofFile } from "@/upload/proof/uploadProofReport/uploadProofReport";
import {
  makeUploadProofFileFromFacts,
  recordUploadProofEvent,
  type ProofTiming,
  type UploadProofState,
} from "@/upload/proof/uploadProofState/uploadProofState";

/** The routes the harness drives itself; the engine has its own two. */
export type UploadProofApi = Pick<
  typeof import("@/api/uploads/uploads"),
  | "getCurrentUploadSession"
  | "openUploadSession"
  | "putUploadManifest"
  | "commitUploadSession"
>;

/** Everything a run reaches outside itself. Injectable for tests. */
export type UploadProofDependencies = {
  api: UploadProofApi;
  createEngine: typeof createUploadEngine;
  now: () => number;
  /** Bytes of JS heap in use, where the browser will say. */
  readHeapBytes: () => number | null;
};

/** One run's inputs. `state` is advanced in place. */
export type UploadProofRun = {
  state: UploadProofState;
  files: readonly File[];
  /** `before-commit` waits for `state.release()` before committing. */
  hold: "before-commit" | null;
  onLog?: (line: string) => void;
  /** Entries per manifest call. `UPLOAD_LIMITS.manifestEntriesPerRequest`. */
  batchSize?: number;
  dependencies?: Partial<UploadProofDependencies>;
};

/** The run with every default filled in, as the phases see it. */
type RunContext = {
  run: Readonly<UploadProofRun>;
  dependencies: UploadProofDependencies;
  log: (line: string) => void;
  timings: Map<string, ProofTiming>;
};

/** `performance.memory`, Chrome's own and absent everywhere else. */
function _readChromeHeapBytes(): number | null {
  const memory: unknown = Reflect.get(performance, "memory");
  const used: unknown =
    typeof memory === "object" && memory !== null
      ? Reflect.get(memory, "usedJSHeapSize")
      : undefined;
  return typeof used === "number" ? used : null;
}

const DEFAULT_DEPENDENCIES: UploadProofDependencies = {
  api: {
    getCurrentUploadSession,
    openUploadSession,
    putUploadManifest,
    commitUploadSession,
  },
  createEngine: createUploadEngine,
  now: () => {
    return performance.now();
  },
  readHeapBytes: _readChromeHeapBytes,
};

/**
 * The concurrency a harness URL asks for, from `?concurrency=N`.
 *
 * Anything that is not a whole number from 1 to 8 falls back to the
 * configured default, so a typo cannot start forty lanes.
 */
export function getConcurrencyFromSearch(search: string): number {
  const asked = Number(new URLSearchParams(search).get("concurrency"));
  return Number.isInteger(asked) && asked >= 1 && asked <= 8
    ? asked
    : appConfig.upload.maxParallelTransfers;
}

/** The hold a harness URL asks for: `?hold=before-commit`, or none. */
export function getHoldFromSearch(search: string): "before-commit" | null {
  return new URLSearchParams(search).get("hold") === "before-commit"
    ? "before-commit"
    : null;
}

/** Consecutive slices of at most `size`, in order. */
export function makeBatchesFromItems<T>(
  items: readonly T[],
  size: number,
): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => {
    return items.slice(index * size, (index + 1) * size);
  });
}

/**
 * The files the engine should send: every declared file the manifest neither
 * refused nor reported as already landed, paired back by `clientRef`.
 */
export function getPendingFilesFromOutcomes(
  options: Readonly<{
    files: readonly File[];
    outcomes: readonly ManifestOutcome[];
  }>,
): UploadEngineFile[] {
  return options.outcomes.flatMap((outcome) => {
    const file = options.files[Number(outcome.clientRef)];
    const isPending =
      outcome.disposition !== "refused" &&
      outcome.disposition !== "already_done";
    return file !== undefined && isPending
      ? [{ fileId: outcome.fileId, file }]
      : [];
  });
}

/**
 * The batch to use: a `draft` is reused, nothing open opens one, and an
 * `uploading` batch is a resume.
 */
async function _openOrResumeSession(
  dependencies: UploadProofDependencies,
): Promise<UploadSessionDetail> {
  const current = await dependencies.api.getCurrentUploadSession();
  return (
    current ??
    dependencies.api.openUploadSession({
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  );
}

/**
 * One file's entry. A resume carries the content hash, because after commit
 * the manifest matches by hash or refuses: a file with no hash that matches
 * nothing is a `409`.
 */
async function _makeEntry(options: {
  file: File;
  clientRef: string;
  isResume: boolean;
}): Promise<ManifestEntry> {
  const entry = await getManifestEntryFromFile(options);
  return options.isResume
    ? { ...entry, contentHash: await makeSha256HexFromBlob(options.file) }
    : entry;
}

/** Declares every file, a batch at a time, and answers every outcome. */
async function _declareFiles(
  context: RunContext,
  session: Readonly<{ sessionId: string; isResume: boolean }>,
): Promise<ManifestOutcome[]> {
  const { run } = context;
  const indexed = run.files.map((file, index) => {
    return { file, clientRef: String(index), isResume: session.isResume };
  });
  const batchSize = run.batchSize ?? UPLOAD_LIMITS.manifestEntriesPerRequest;
  return makeBatchesFromItems(indexed, batchSize).reduce<
    Promise<ManifestOutcome[]>
  >(async (declaredSoFar, batch) => {
    const declared = await declaredSoFar;
    const entries = await Promise.all(batch.map(_makeEntry));
    const response = await context.dependencies.api.putUploadManifest({
      sessionId: session.sessionId,
      files: entries,
    });
    return [...declared, ...response.outcomes];
  }, Promise.resolve([]));
}

/** Parks the run in `held` until somebody calls `state.release()`. */
function _waitForRelease(state: UploadProofState): Promise<void> {
  state.phase = "held";
  return new Promise((settle) => {
    state.release = () => {
      state.release = null;
      settle();
    };
  });
}

/** One line for the log about an event that ended a file. */
function _describeEnding(
  event: UploadEngineEvent,
  namesByFileId: ReadonlyMap<string, string>,
): string | null {
  if (event.kind === "settled" || event.kind === "file-started") {
    return null;
  }
  const name = namesByFileId.get(event.fileId) ?? event.fileId;
  if (event.kind === "file-done") {
    return `done ${name}`;
  }
  if (event.kind === "file-skipped") {
    return `skipped ${name}: the same bytes as another file in this batch`;
  }
  return event.kind === "file-failed"
    ? `failed ${name}: ${event.problemCode}`
    : null;
}

/** Runs the engine over the pending files, keeping every event and clock. */
async function _sendPending(
  context: RunContext,
  options: Readonly<{ sessionId: string; pending: UploadEngineFile[] }>,
): Promise<void> {
  const { dependencies, run } = context;
  const namesByFileId = new Map(
    options.pending.map((item) => {
      return [item.fileId, item.file.name];
    }),
  );
  run.state.phase = "transferring";
  const engine = dependencies.createEngine({
    sessionId: options.sessionId,
    concurrency: run.state.concurrency,
    onEvent: (event) => {
      run.state.events.push(event);
      const now = dependencies.now();
      recordUploadProofEvent({ timings: context.timings, event, now });
      const line = _describeEnding(event, namesByFileId);
      if (line !== null) {
        context.log(line);
      }
    },
  });
  await engine.start(options.pending);
}

/** Declare, hold if asked, commit unless resuming, send: one run's phases. */
async function _runPhases(context: RunContext): Promise<void> {
  const { dependencies, run } = context;
  const { state } = run;
  state.phase = "declaring";
  const session = await _openOrResumeSession(dependencies);
  state.sessionId = session.sessionId;
  state.isResume = session.state === "uploading";
  context.log(`Session ${session.sessionId} (${session.state})`);
  state.outcomes = await _declareFiles(context, {
    sessionId: session.sessionId,
    isResume: state.isResume,
  });
  const pending = getPendingFilesFromOutcomes({
    files: run.files,
    outcomes: state.outcomes,
  });
  context.log(`Declared ${run.files.length}: ${pending.length} to send`);
  if (!state.isResume) {
    if (run.hold === "before-commit") {
      context.log("Held before commit: call __uploadProof.release()");
      await _waitForRelease(state);
    }
    await dependencies.api.commitUploadSession({
      sessionId: session.sessionId,
      intent: "arm",
    });
  }
  if (pending.length > 0) {
    await _sendPending(context, { sessionId: session.sessionId, pending });
  }
}

/** Every picked file's row, in the order they were declared. */
function _makeProofFiles(context: RunContext): UploadProofFile[] {
  const { run } = context;
  return run.state.outcomes.flatMap((outcome) => {
    const file = run.files[Number(outcome.clientRef)];
    return file === undefined
      ? []
      : [
          makeUploadProofFileFromFacts({
            file,
            contentType: getDeclaredContentTypeFromFile(file),
            outcome,
            timing: context.timings.get(outcome.fileId),
          }),
        ];
  });
}

/** Samples the heap every half second until stopped, then answers the peak. */
function _startHeapSampler(
  readHeapBytes: () => number | null,
): () => number | null {
  let peak = readHeapBytes();
  const timer = setInterval(() => {
    const now = readHeapBytes();
    peak = now !== null && (peak === null || now > peak) ? now : peak;
  }, 500);
  return () => {
    clearInterval(timer);
    return peak;
  };
}

/**
 * One whole proof run over the picked files, against the real API.
 *
 * **Advances `run.state` in place**, through `declaring`, `held` when asked,
 * `transferring`, and `finished` or `failed`. It asks `GET /current` first: a
 * `draft` is reused, a `204` opens a new one, and an `uploading` batch is a
 * resume, which declares every file with its hash and never commits. Files go
 * to the manifest in batches of `UPLOAD_LIMITS.manifestEntriesPerRequest`,
 * and the engine gets every file the manifest neither refused nor reported as
 * already done. The run ends when the engine's `start` resolves, not when a
 * `settled` event arrives, because the engine emits at most one and none for
 * a run no `complete` answered. The rows and the totals are written before
 * the final phase, so a reader that waits for `finished` finds them there.
 * Never rejects: a failure is `phase: "failed"` with `error`.
 */
export async function runUploadProof(
  run: Readonly<UploadProofRun>,
): Promise<void> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...run.dependencies };
  const context: RunContext = {
    run,
    dependencies,
    log: run.onLog ?? (() => {}),
    timings: new Map(),
  };
  const startedAt = dependencies.now();
  const stopHeapSampler = _startHeapSampler(dependencies.readHeapBytes);
  const ending = await _runPhases(context).then(
    () => {
      return { phase: "finished" as const, error: null };
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return { phase: "failed" as const, error: message };
    },
  );
  Object.assign(run.state, {
    wallMs: dependencies.now() - startedAt,
    jsHeapPeakBytes: stopHeapSampler(),
    files: _makeProofFiles(context),
    error: ending.error,
  });
  run.state.phase = ending.phase;
}
