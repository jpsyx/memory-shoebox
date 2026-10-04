import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { UPLOAD_LIMITS, type ManifestEntry } from "@memory-shoebox/shared";
import type { UploadControllerContext } from "../createUploadSessionController.types";
import { declareUploadPicks } from "../uploadDeclarationHelpers";
import {
  getPhaseFromUploadDetail,
  loadUploadSession,
} from "../uploadManifestReadHelpers";
import { makeRecoveryMatchesFromChoice } from "../uploadRecoveryHelpers/uploadRecoveryHelpers";
import { runUploadTransfer } from "../uploadTransferHelpers";
import { checkRetainedUploadPicks } from "./checkRetainedUploadPicks";

type ConfirmUploadRecoveryMatchOptions = {
  context: UploadControllerContext;
  generation: number;
  fileId: string;
  clientRef: string;
};

async function _readRecoveryBaseline(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const sessionId = context.state.snapshot.detail?.sessionId;
  if (!sessionId) {
    throw new Error("Open the upload batch before recovering its files.");
  }
  await loadUploadSession({ context, generation, sessionId });
  if (
    context.isCurrent(generation) &&
    context.state.snapshot.detail?.state === "cancelled"
  ) {
    throw new Error("A cancelled batch cannot be recovered.");
  }
}

async function _continueRecovery(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const snapshot = context.state.snapshot;
  if (
    !context.isCurrent(generation) ||
    snapshot.recoveryMatches.ambiguous.length > 0
  ) {
    return;
  }
  _retainMatchedHandles(context);
  if (snapshot.detail!.state !== "settled") {
    await _declareMatchedPicks(options);
  }
  if (!context.isCurrent(generation)) {
    return;
  }
  if (context.state.snapshot.detail!.state === "draft") {
    const extras = snapshot.recoveryMatches.unmatchedClientRefs.flatMap(
      (clientRef) => {
        const pick = context.state.recoveryPicks?.get(clientRef);
        return pick ? [pick.file] : [];
      },
    );
    if (extras.length > 0) {
      await declareUploadPicks({ ...options, files: extras });
      if (context.isCurrent(generation)) {
        context.publish({
          ...context.state.snapshot,
          recoveryMatches: {
            ...context.state.snapshot.recoveryMatches,
            unmatchedClientRefs: [],
          },
        });
      }
    }
    return;
  }
  const fileIds = snapshot.recoveryMatches.knownMatches.map((match) => {
    return match.fileId;
  });
  await _retryAndTransfer({ ...options, fileIds });
}

function _retainMatchedHandles(
  context: Readonly<UploadControllerContext>,
): void {
  const filesById = new Map(context.state.snapshot.filesById);
  const matchedIds = new Set<string>();
  context.state.snapshot.recoveryMatches.knownMatches.forEach((match) => {
    const file = context.state.recoveryPicks?.get(match.clientRef)?.file;
    if (file && !matchedIds.has(match.fileId)) {
      filesById.set(match.fileId, file);
      matchedIds.add(match.fileId);
    }
  });
  context.publish({ ...context.state.snapshot, filesById });
}

async function _declareMatchedPicks(
  options: Readonly<{ context: UploadControllerContext; generation: number }>,
): Promise<void> {
  const { context, generation } = options;
  const entries = _getManifestEntriesFromMatches(context);
  try {
    await entries.reduce(async (previousChunk, _entry, position) => {
      await previousChunk;
      if (
        !context.isCurrent(generation) ||
        position % UPLOAD_LIMITS.manifestEntriesPerRequest !== 0
      ) {
        return;
      }
      await context.dependencies.api.putUploadManifest({
        sessionId: context.state.snapshot.detail!.sessionId,
        files: entries.slice(
          position,
          position + UPLOAD_LIMITS.manifestEntriesPerRequest,
        ),
      });
    }, Promise.resolve());
    if (context.isCurrent(generation)) {
      await _readRecoveryBaseline(options);
    }
  } catch (error) {
    if (!context.isCurrent(generation)) {
      return;
    }
    if (
      !(error instanceof ApiRequestError) ||
      error.code !== "upload_session_conflict"
    ) {
      throw error;
    }
    await _readRecoveryBaseline(options);
    if (
      context.isCurrent(generation) &&
      context.state.snapshot.detail?.state !== "settled"
    ) {
      throw error;
    }
  }
}

function _getManifestEntriesFromMatches(
  context: Readonly<UploadControllerContext>,
): ManifestEntry[] {
  const entriesById = new Map<string, ManifestEntry>();
  context.state.snapshot.recoveryMatches.knownMatches.forEach((match) => {
    const row = context.state.snapshot.detail!.files.find((file) => {
      return file.fileId === match.fileId;
    })!;
    const pick = context.state.recoveryPicks?.get(match.clientRef);
    if (
      pick &&
      row.state !== "done" &&
      row.state !== "refused" &&
      row.state !== "cancelled" &&
      !entriesById.has(row.fileId)
    ) {
      entriesById.set(row.fileId, {
        clientRef: match.clientRef,
        fileId: row.fileId,
        originalFilename: row.originalFilename,
        declaredBytes: row.declaredBytes,
        declaredContentType: row.declaredContentType,
        contentHash: pick.contentHash,
      });
    }
  });
  return [...entriesById.values()];
}

async function _retryAndTransfer(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    fileIds: readonly string[];
  }>,
): Promise<void> {
  const { context, generation } = options;
  if (context.state.snapshot.detail!.state === "draft") {
    throw new Error("Start a draft explicitly before retrying files.");
  }
  await [...new Set(options.fileIds)].reduce(async (previousRetry, fileId) => {
    await previousRetry;
    await _retryRetainedFile({ context, generation, fileId });
  }, Promise.resolve());
  if (!context.isCurrent(generation)) {
    return;
  }
  await _readRecoveryBaseline(options);
  if (
    context.isCurrent(generation) &&
    context.state.snapshot.detail!.files.some((row) => {
      return (
        (row.state === "waiting" || row.state === "sending") &&
        context.state.snapshot.filesById.has(row.fileId)
      );
    })
  ) {
    await runUploadTransfer(options);
  }
}

async function _retryRetainedFile(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    fileId: string;
  }>,
): Promise<void> {
  const { context, generation, fileId } = options;
  if (!context.isCurrent(generation)) {
    return;
  }
  const row = context.state.snapshot.detail!.files.find((file) => {
    return file.fileId === fileId;
  });
  if (
    row?.state !== "failed" ||
    !context.state.snapshot.filesById.has(fileId)
  ) {
    return;
  }
  const response = await context.dependencies.api.retryUploadFile({
    sessionId: context.state.snapshot.detail!.sessionId,
    fileId,
  });
  if (!context.isCurrent(generation)) {
    return;
  }
  const snapshot = context.state.snapshot;
  const fileActivityById = new Map(snapshot.fileActivityById);
  fileActivityById.set(fileId, {
    kind: "preparing",
    isIncludedInEmail: response.isIncludedInEmail,
  });
  context.publish({
    ...snapshot,
    fileActivityById,
    detail: {
      ...snapshot.detail!,
      files: snapshot.detail!.files.map((file) => {
        return file.fileId === fileId ? response.file : file;
      }),
    },
  });
}

/** Classifies all re-picks before modifying the manifest or retrying a row. */
export async function checkUploadRecovery(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    files: readonly File[];
  }>,
): Promise<void> {
  const { context, generation, files } = options;
  await _readRecoveryBaseline(options);
  if (!context.isCurrent(generation)) {
    return;
  }
  const retained =
    files.length > 0
      ? new Map(
          files.map((file) => {
            return [
              crypto.randomUUID(),
              { file, contentHash: undefined as string | undefined },
            ];
          }),
        )
      : (context.state.recoveryPicks ?? new Map());
  context.state.recoveryPicks = retained;
  context.publish({
    ...context.state.snapshot,
    phase: "checking",
    checkingCount: 0,
    checkingTotal: retained.size,
    recoveryFilesByRef: new Map(
      [...retained].map(([reference, pick], position) => {
        return [reference, { file: pick.file, ordinal: position + 1 }];
      }),
    ),
  });
  const matches = await checkRetainedUploadPicks(options);
  if (!context.isCurrent(generation)) {
    return;
  }
  context.publish({
    ...context.state.snapshot,
    recoveryMatches: matches,
    phase: getPhaseFromUploadDetail(context.state.snapshot.detail!),
  });
  await _continueRecovery(options);
}

/** Explicitly chooses a displayed candidate; all ambiguities block sending. */
export async function confirmUploadRecoveryMatch(
  options: Readonly<ConfirmUploadRecoveryMatchOptions>,
): Promise<void> {
  const { context, fileId, clientRef } = options;
  const snapshot = context.state.snapshot;
  const candidate = snapshot.recoveryMatches.ambiguous.find((match) => {
    return match.clientRef === clientRef;
  });
  const row = snapshot.detail?.files.find((file) => {
    return file.fileId === fileId;
  });
  if (
    !candidate?.fileIds.includes(fileId) ||
    !row ||
    !context.state.recoveryPicks?.has(clientRef)
  ) {
    throw new Error("Choose one of this picked file's recovery candidates.");
  }
  const matches = makeRecoveryMatchesFromChoice({
    matches: snapshot.recoveryMatches,
    row,
    clientRef,
    contentHashesByRef: new Map(
      [...context.state.recoveryPicks!].map(([reference, pick]) => {
        return [reference, pick.contentHash];
      }),
    ),
  });
  context.publish({ ...snapshot, recoveryMatches: matches });
  if (matches.ambiguous.length === 0) {
    await _readRecoveryBaseline(options);
    if (context.isCurrent(options.generation)) {
      await _continueRecovery(options);
    }
  }
}

/**
 * Leaves the unidentified incoming original unsent and its saved row missing.
 */
export async function skipUploadRecoveryMatch(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    clientRef: string;
  }>,
): Promise<void> {
  const { context, clientRef } = options;
  const snapshot = context.state.snapshot;
  context.state.recoveryPicks?.delete(clientRef);
  context.publish({
    ...snapshot,
    recoveryMatches: {
      ...snapshot.recoveryMatches,
      ambiguous: snapshot.recoveryMatches.ambiguous.filter((match) => {
        return match.clientRef !== clientRef;
      }),
    },
  });
  await _continueRecovery(options);
}

/** Retries retained failed ids from a fresh server baseline, never arms. */
export async function retryMissingUploadFiles(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    fileIds: readonly string[];
  }>,
): Promise<void> {
  await _readRecoveryBaseline(options);
  if (!options.context.isCurrent(options.generation)) {
    return;
  }
  if (options.context.state.snapshot.recoveryMatches.ambiguous.length > 0) {
    throw new Error("Choose the ambiguous files before retrying.");
  }
  await _retryAndTransfer(options);
}
