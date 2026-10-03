import { makeMediaWorkerClientFromPort } from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";
import { getResumeMatchesFromFiles } from "../uploadRecoveryHelpers/uploadRecoveryHelpers";
import type {
  UploadControllerContext,
  UploadRecoveryMatches,
} from "../uploadSessionController.types";

/** Owns the serial hashing worker, checking progress and cancellation. */
export async function checkRetainedUploadPicks(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<UploadRecoveryMatches> {
  const { context, generation } = options;
  const cancellation = new AbortController();
  const worker = makeMediaWorkerClientFromPort(
    context.dependencies.createMediaWorker(),
  );
  const cancel = () => {
    cancellation.abort();
    worker.terminate();
  };
  context.state.cancelRecoveryChecking = cancel;
  const picks = [...context.state.recoveryPicks!].map(([clientRef, pick]) => {
    return {
      clientRef,
      file: pick.file,
    };
  });
  try {
    return await getResumeMatchesFromFiles({
      picks,
      rows: context.state.snapshot.detail!.files,
      signal: cancellation.signal,
      hashFile: async (file) => {
        return _getHashFromRetainedFile({ context, generation, worker, file });
      },
      onChecked: (checkingCount) => {
        if (context.isCurrent(generation)) {
          context.publish({ ...context.state.snapshot, checkingCount });
        }
      },
    });
  } finally {
    worker.terminate();
    if (context.state.cancelRecoveryChecking === cancel) {
      context.state.cancelRecoveryChecking = undefined;
    }
  }
}

async function _getHashFromRetainedFile(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    worker: import("@/upload/mediaWorker/makeMediaWorkerClientFromPort").MediaWorkerClient;
    file: Blob;
  }>,
): Promise<string> {
  const { context, generation, worker, file } = options;
  const pick = [...context.state.recoveryPicks!.values()].find((entry) => {
    return entry.file === file;
  })!;
  const contentHash = pick.contentHash ?? (await worker.hash(file));
  if (context.isCurrent(generation)) {
    context.state.recoveryPicks!.forEach((retainedPick) => {
      if (retainedPick.file === file) {
        retainedPick.contentHash = contentHash;
      }
    });
  }
  return contentHash;
}
