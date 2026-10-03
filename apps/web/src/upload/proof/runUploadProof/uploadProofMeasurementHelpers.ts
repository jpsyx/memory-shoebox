import { getDeclaredContentTypeFromFile } from "@/upload/getManifestEntryFromFile/getDeclaredContentTypeFromFile";

import type { UploadProofFile } from "@/upload/proof/uploadProofReport.constants";

import { makeUploadProofFileFromFacts } from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

import type { RunContext, UploadProofRun } from "./runUploadProof.types";

import { splitPendingOutcomes } from "./uploadProofInputHelpers";

/** Every picked file's row, in the order they were declared. */
export function makeProofFiles(
  context: Omit<RunContext, "run"> & { run: Readonly<UploadProofRun> },
): UploadProofFile[] {
  const { run } = context;
  const twinClientRefs = new Set(
    splitPendingOutcomes(run.state.outcomes).twinOutcomes.map((outcome) => {
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
export function startHeapSampler(
  readHeapBytes: () => number | undefined,
): () => number | undefined {
  let peak = readHeapBytes();
  const sample = (): void => {
    const heapBytes = readHeapBytes();
    peak =
      heapBytes !== undefined && (peak === undefined || heapBytes > peak)
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
