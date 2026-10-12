import { appConfig } from "../../../../../app.config";
import {
  makeMediaWorkerClientFromPort,
  type MediaWorkerClient,
} from "@/upload/mediaWorker/makeMediaWorkerClientFromPort";
import type { ManifestEntry } from "@memory-shoebox/shared";
import type {
  UploadControllerContext,
  UploadPendingPick,
} from "./createUploadSessionController.types";

type CheckingLane = {
  worker: MediaWorkerClient | undefined;
  wasmDecodeCount: number;
};

type CheckingContext = {
  context: UploadControllerContext;
  lanes: CheckingLane[];
  isCurrent: () => boolean;
  takePick: () => UploadPendingPick | undefined;
};

type FingerprintEntryOptions = {
  entry: ManifestEntry;
  file: File;
  worker: MediaWorkerClient;
  lane: CheckingLane;
};

function _isHashableEntry(entry: Readonly<ManifestEntry>): boolean {
  const accepted: readonly string[] = appConfig.upload.acceptedContentTypes;
  return (
    accepted.includes(entry.declaredContentType.toLowerCase()) &&
    entry.declaredBytes > 0 &&
    entry.declaredBytes <= appConfig.upload.maxFileBytes
  );
}

function _getWorkerFromLane(
  options: Readonly<{ lane: CheckingLane; context: UploadControllerContext }>,
): MediaWorkerClient {
  const { lane, context } = options;
  if (lane.wasmDecodeCount >= appConfig.upload.heicWorkerRecycleCount) {
    lane.worker?.terminate();
    lane.worker = undefined;
    lane.wasmDecodeCount = 0;
  }
  lane.worker ??= makeMediaWorkerClientFromPort(
    context.dependencies.createMediaWorker(),
  );
  return lane.worker;
}

async function _getCheckedEntryFromPick(
  options: Readonly<{
    checking: CheckingContext;
    pick: UploadPendingPick;
    lane: CheckingLane;
  }>,
): Promise<ManifestEntry | undefined> {
  const { checking, pick, lane } = options;
  const entry = await checking.context.dependencies.getManifestEntryFromFile({
    file: pick.file,
    clientRef: pick.clientRef,
  });
  if (!checking.isCurrent()) {
    return undefined;
  }
  const identified = { ...entry, pickId: pick.clientRef };
  if (!_isHashableEntry(entry)) {
    return identified;
  }
  const worker = _getWorkerFromLane({ lane, context: checking.context });
  const contentHash = await worker.hash(pick.file);
  if (!checking.isCurrent()) {
    return undefined;
  }
  return _makeFingerprintedEntryFromFile({
    entry: { ...identified, contentHash },
    file: pick.file,
    worker,
    lane,
  });
}

async function _makeFingerprintedEntryFromFile(
  options: Readonly<FingerprintEntryOptions>,
): Promise<ManifestEntry> {
  const { entry, file, worker, lane } = options;
  if (!entry.declaredContentType.toLowerCase().startsWith("image/")) {
    return entry;
  }
  const made = await worker.makeVisualFingerprintFromFile({
    file,
    contentType: entry.declaredContentType.toLowerCase(),
    size:
      entry.width && entry.height
        ? { width: entry.width, height: entry.height }
        : undefined,
  });
  lane.wasmDecodeCount += Number(made.usedWasmDecoder);
  return {
    ...entry,
    visualFingerprint: made.visualFingerprint,
    width: entry.width ?? made.originalSize?.width,
    height: entry.height ?? made.originalSize?.height,
  };
}

async function _readPicksInLane(
  options: Readonly<{ checking: CheckingContext; lane: CheckingLane }>,
): Promise<void> {
  const { checking, lane } = options;
  const pick = checking.isCurrent() ? checking.takePick() : undefined;
  if (!pick) {
    return;
  }
  const entry = await _getCheckedEntryFromPick({ checking, pick, lane });
  if (!checking.isCurrent() || !entry) {
    return;
  }
  pick.entry = entry;
  checking.context.publish({
    ...checking.context.state.snapshot,
    checkingCount: checking.context.state.snapshot.checkingCount + 1,
  });
  await _readPicksInLane(options);
}

function _makeCheckingContext(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): { checking: CheckingContext; cancel: () => void; total: number } {
  const unread = options.context.state.pendingPicks.filter((pick) => {
    return !pick.entry;
  });
  let position = 0;
  let isChecking = true;
  const lanes: CheckingLane[] = Array.from({ length: 2 }, () => {
    return { worker: undefined, wasmDecodeCount: 0 };
  });
  return {
    total: unread.length,
    checking: {
      context: options.context,
      lanes,
      isCurrent: () => {
        return isChecking && options.context.isCurrent(options.generation);
      },
      takePick: () => {
        return unread[position++];
      },
    },
    cancel: () => {
      isChecking = false;
      lanes.forEach((lane) => {
        return lane.worker?.terminate();
      });
    },
  };
}

/** Reads original checksums and photo fingerprints in two cancellable lanes. */
export async function readPendingUploadPicks(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
  }>,
): Promise<void> {
  const { context } = options;
  const { checking, cancel, total } = _makeCheckingContext(options);
  if (total === 0) {
    return;
  }
  context.state.cancelRecoveryChecking = cancel;
  context.publish({
    ...context.state.snapshot,
    phase: "checking",
    checkingCount: 0,
    checkingTotal: total,
  });
  try {
    await Promise.all(
      checking.lanes.map((lane) => {
        return _readPicksInLane({ checking, lane });
      }),
    );
  } finally {
    cancel();
    if (context.state.cancelRecoveryChecking === cancel) {
      context.state.cancelRecoveryChecking = undefined;
    }
  }
}
