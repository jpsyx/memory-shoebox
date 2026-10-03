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
  /** The whole-file hash a resume's entries carry. */
  makeSha256HexFromBlob: typeof makeSha256HexFromBlob;
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
  makeSha256HexFromBlob,
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

/** The outcomes of files worth sending, and the twins among them. */
type PendingOutcomes = {
  /** One outcome per file id: the first pick the manifest matched to it. */
  firstOutcomes: ManifestOutcome[];
  /** Later picks the manifest matched to a file id an earlier pick holds. */
  twinOutcomes: ManifestOutcome[];
};

/**
 * Splits off the outcomes the engine must not be given twice.
 *
 * A resume matches by hash, so byte-identical picks share one file id, in one
 * batch or across two. Handing the engine both would send the file twice and
 * end it twice, so only the first pick of each id is sent and the rest are
 * twins. A refused file and one already up are never pending, and so never a
 * twin.
 */
function _splitPendingOutcomes(
  outcomes: readonly ManifestOutcome[],
): PendingOutcomes {
  const seenFileIds = new Set<string>();
  const firstOutcomes: ManifestOutcome[] = [];
  const twinOutcomes: ManifestOutcome[] = [];
  outcomes
    .filter((outcome) => {
      return (
        outcome.disposition !== "refused" &&
        outcome.disposition !== "already_done"
      );
    })
    .forEach((outcome) => {
      const isTwin = seenFileIds.has(outcome.fileId);
      seenFileIds.add(outcome.fileId);
      (isTwin ? twinOutcomes : firstOutcomes).push(outcome);
    });
  return { firstOutcomes, twinOutcomes };
}

/**
 * The files the engine should send: every declared file the manifest neither
 * refused nor reported as already landed, paired back by `clientRef`, and
 * once per file id however many identical picks the manifest matched to it.
 */
export function getPendingFilesFromOutcomes(
  options: Readonly<{
    files: readonly File[];
    outcomes: readonly ManifestOutcome[];
  }>,
): UploadEngineFile[] {
  return _splitPendingOutcomes(options.outcomes).firstOutcomes.flatMap(
    (outcome) => {
      const file = options.files[Number(outcome.clientRef)];
      return file === undefined ? [] : [{ fileId: outcome.fileId, file }];
    },
  );
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

/** One picked file with the `clientRef` its entry will carry. */
type IndexedFile = { file: File; clientRef: string };

/**
 * A batch's entries. A resume carries each file's content hash, because after
 * commit the manifest matches by hash or refuses: a file with no hash that
 * matches nothing is a `409`.
 *
 * The headers are small reads and are made together. The hashes each read a
 * whole file in 8 MiB slices on the main thread, so they are made **one file
 * at a time**: a batch of hundreds all at once would hold more slices in
 * flight than a phone has memory for.
 */
async function _makeEntries(
  context: RunContext,
  options: Readonly<{ batch: readonly IndexedFile[]; isResume: boolean }>,
): Promise<ManifestEntry[]> {
  const read = await Promise.all(
    options.batch.map(async (item) => {
      return { file: item.file, entry: await getManifestEntryFromFile(item) };
    }),
  );
  if (!options.isResume) {
    return read.map((item) => {
      return item.entry;
    });
  }
  const { makeSha256HexFromBlob: makeHash } = context.dependencies;
  return read.reduce<Promise<ManifestEntry[]>>(async (hashedSoFar, item) => {
    const hashed = await hashedSoFar;
    return [
      ...hashed,
      { ...item.entry, contentHash: await makeHash(item.file) },
    ];
  }, Promise.resolve([]));
}

/** Declares every file, a batch at a time, and answers every outcome. */
async function _declareFiles(
  context: RunContext,
  session: Readonly<{ sessionId: string; isResume: boolean }>,
): Promise<ManifestOutcome[]> {
  const { run } = context;
  const indexed = run.files.map((file, index) => {
    return { file, clientRef: String(index) };
  });
  const batchSize = run.batchSize ?? UPLOAD_LIMITS.manifestEntriesPerRequest;
  return makeBatchesFromItems(indexed, batchSize).reduce<
    Promise<ManifestOutcome[]>
  >(async (declaredSoFar, batch) => {
    const declared = await declaredSoFar;
    const entries = await _makeEntries(context, {
      batch,
      isResume: session.isResume,
    });
    const response = await context.dependencies.api.putUploadManifest({
      sessionId: session.sessionId,
      files: entries,
    });
    return [...declared, ...response.outcomes];
  }, Promise.resolve([]));
}

/**
 * Parks the run in `held` until somebody calls `state.release()`, which puts
 * it back in `declaring`: the commit that follows is still part of declaring,
 * and a run is never `held` with nothing to release.
 */
function _waitForRelease(state: UploadProofState): Promise<void> {
  state.phase = "held";
  return new Promise((settle) => {
    state.release = () => {
      state.release = null;
      state.phase = "declaring";
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
  const twinCount = _splitPendingOutcomes(state.outcomes).twinOutcomes.length;
  context.log(
    `Declared ${run.files.length}: ${pending.length} to send` +
      (twinCount > 0 ? `, ${twinCount} the same bytes as another pick` : ""),
  );
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
  const twinClientRefs = new Set(
    _splitPendingOutcomes(run.state.outcomes).twinOutcomes.map((outcome) => {
      return outcome.clientRef;
    }),
  );
  return run.state.outcomes.flatMap((outcome) => {
    const file = run.files[Number(outcome.clientRef)];
    return file === undefined
      ? []
      : [
          makeUploadProofFileFromFacts({
            file,
            contentType: getDeclaredContentTypeFromFile(file),
            outcome,
            isTwin: twinClientRefs.has(outcome.clientRef),
            timing: context.timings.get(outcome.fileId),
          }),
        ];
  });
}

/**
 * Samples the heap every half second until stopped, then answers the peak.
 *
 * Takes one last sample when stopped, so a run shorter than the interval
 * still reports its end. **A coarse figure**: Chrome rounds
 * `performance.memory` unless it was started with
 * `--enable-precise-memory-info`, and it counts the main thread's heap only,
 * not the media worker's.
 */
function _startHeapSampler(
  readHeapBytes: () => number | null,
): () => number | null {
  let peak = readHeapBytes();
  const sample = (): void => {
    const heapBytes = readHeapBytes();
    peak =
      heapBytes !== null && (peak === null || heapBytes > peak)
        ? heapBytes
        : peak;
  };
  const timer = setInterval(sample, 500);
  return () => {
    clearInterval(timer);
    sample();
    return peak;
  };
}

/**
 * One whole proof run over the picked files, against the real API.
 *
 * **Advances `run.state` in place**, through `declaring`, `held` when asked,
 * `transferring`, and `finished` or `failed`. It asks `GET /current` first: a
 * `draft` is reused, a `204` opens a new one, and an `uploading` batch is a
 * resume, which declares every file with its hash, one file hashed at a time,
 * and never commits. Files go to the manifest in batches of
 * `UPLOAD_LIMITS.manifestEntriesPerRequest`, and the engine gets every file
 * the manifest neither refused nor reported as already done, once per file id:
 * a byte-identical twin is reported `skipped` and not sent. The run ends when the engine's `start` resolves, not when a
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
