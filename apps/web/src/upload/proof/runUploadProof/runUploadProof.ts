import type { UploadProofRun, RunContext } from "./runUploadProof.types";

import {
  startHeapSampler,
  makeProofFiles,
} from "./uploadProofMeasurementHelpers";

import { runPhases } from "./runPhases";

import { DEFAULT_DEPENDENCIES } from "./runUploadProof.constants";

/**
 * Runs the picked files against the real API and updates `run.state` in place.
 *
 * An existing draft is reused. With no open session, the proof creates a new
 * draft. An uploading batch resumes by matching hashes without committing
 * again. Refused files
 * and files already done are excluded; a byte-identical twin is reported as
 * `skipped` and sent only once per file id.
 *
 * The run ends when the engine's `start` resolves. A `settled` event reports
 * the batch state and does not mean every file in this run has finished. The
 * final rows and totals are available before `finished` or `failed` is set.
 * Never rejects: a failure is `phase: "failed"` with `error`.
 */
export async function runUploadProof(
  run: Readonly<Omit<UploadProofRun, "files">> &
    Readonly<{ files: readonly File[] }>,
): Promise<void> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...run.dependencies };
  const context: RunContext = {
    run: { ...run, files: [...run.files] },
    dependencies,
    log: run.onLog ?? (() => {}),
    timings: new Map(),
  };
  const startedAt = dependencies.now();
  const stopHeapSampler = startHeapSampler(dependencies.readHeapBytes);
  const ending = await runPhases(context).then(
    () => {
      return { phase: "finished" as const, error: undefined };
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return { phase: "failed" as const, error: message };
    },
  );
  Object.assign(run.state, {
    wallMs: dependencies.now() - startedAt,
    jsHeapPeakBytes: stopHeapSampler(),
    files: makeProofFiles(context),
    error: ending.error,
  });
  run.state.phase = ending.phase;
}
