import {
  UPLOAD_LIMITS,
  type ManifestEntry,
  type ManifestOutcome,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";

import {
  type UploadEngineEvent,
  type UploadEngineFile,
} from "@/upload/createUploadEngine/createUploadEngine.types";

import { getManifestEntryFromFile } from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";

import {
  recordUploadProofEvent,
  type UploadProofState,
} from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

import type {
  UploadProofDependencies,
  RunContext,
  UploadProofRun,
} from "./runUploadProof.types";

import {
  makeBatchesFromItems,
  getPendingFilesFromOutcomes,
  splitPendingOutcomes,
} from "./uploadProofInputHelpers";

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
  functionOptions: Readonly<{
    context: Omit<RunContext, "run"> & { run: Readonly<UploadProofRun> };
    options: Readonly<{
      batch: ReadonlyArray<{ file: File; clientRef: string }>;
      isResume: boolean;
    }>;
  }>,
): Promise<ManifestEntry[]> {
  const { context, options } = functionOptions;

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
  functionOptions: Readonly<{
    context: Omit<RunContext, "run"> & { run: Readonly<UploadProofRun> };
    session: Readonly<{ sessionId: string; isResume: boolean }>;
  }>,
): Promise<ManifestOutcome[]> {
  const { context, session } = functionOptions;

  const { run } = context;
  const indexed = run.files.map((file, index) => {
    return { file, clientRef: String(index) };
  });
  const batchSize = run.batchSize ?? UPLOAD_LIMITS.manifestEntriesPerRequest;
  return makeBatchesFromItems({ items: indexed, size: batchSize }).reduce<
    Promise<ManifestOutcome[]>
  >(async (declaredSoFar, batch) => {
    const declared = await declaredSoFar;
    const entries = await _makeEntries({
      context: context,
      options: {
        batch,
        isResume: session.isResume,
      },
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
      state.release = undefined;
      state.phase = "declaring";
      settle();
    };
  });
}

/**
 * One line for the log about an event that ended a file, or the run when the
 * batch was closed elsewhere; undefined for the rest.
 */
function _describeEnding(
  functionOptions: Readonly<{
    event: UploadEngineEvent;
    namesByFileId: ReadonlyMap<string, string>;
  }>,
): string | undefined {
  const { event, namesByFileId } = functionOptions;

  if (event.kind === "batch-closed") {
    return "the batch was closed or cancelled elsewhere: the run stopped";
  }
  if (event.kind === "settled" || event.kind === "file-started") {
    return undefined;
  }
  const name = namesByFileId.get(event.fileId) ?? event.fileId;
  if (event.kind === "file-done") {
    return `done ${name}`;
  }
  return event.kind === "file-skipped"
    ? `skipped ${name}: the same bytes as another file in this batch`
    : event.kind === "file-failed"
      ? `failed ${name}: ${event.problemCode}`
      : undefined;
}

/** Runs the engine over the pending files, keeping every event and clock. */
async function _sendPending(
  functionOptions: Readonly<{
    context: Omit<RunContext, "run"> & { run: Readonly<UploadProofRun> };
    options: Readonly<{ sessionId: string; pending: UploadEngineFile[] }>;
  }>,
): Promise<void> {
  const { context, options } = functionOptions;

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
      const line = _describeEnding({
        event: event,
        namesByFileId: namesByFileId,
      });
      if (line !== undefined) {
        context.log(line);
      }
    },
  });
  await engine.start(options.pending);
}

/** Declare, hold if asked, commit unless resuming, send: one run's phases. */
export async function runPhases(
  context: Omit<RunContext, "run"> & { run: Readonly<UploadProofRun> },
): Promise<void> {
  const { dependencies, run } = context;
  const { state } = run;
  state.phase = "declaring";
  const session = await _openOrResumeSession(dependencies);
  state.sessionId = session.sessionId;
  state.isResume = session.state === "uploading";
  context.log(`Session ${session.sessionId} (${session.state})`);
  state.outcomes = await _declareFiles({
    context: context,
    session: {
      sessionId: session.sessionId,
      isResume: state.isResume,
    },
  });
  const pending = getPendingFilesFromOutcomes({
    files: run.files,
    outcomes: state.outcomes,
  });
  const twinCount = splitPendingOutcomes(state.outcomes).twinOutcomes.length;
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
    await _sendPending({
      context: context,
      options: { sessionId: session.sessionId, pending },
    });
  }
}
