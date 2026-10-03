import type { UploadFileDto } from "@memory-shoebox/shared";
import type { UploadRecoveryMatches } from "../uploadSessionController.types";
import type {
  RecoveryMatchChoiceOptions,
  ResumeMatchOptions,
  ResumeMatchIndexes,
} from "./uploadRecoveryHelpers.types";

/** Hashes one handle at a time; metadata only associates hashless rows. */
export async function getResumeMatchesFromFiles(
  options: Readonly<ResumeMatchOptions>,
): Promise<UploadRecoveryMatches> {
  const checkedPicks = new Map<string, string>();
  await options.picks.reduce(async (previousCheck, pick, position) => {
    await previousCheck;
    options.signal.throwIfAborted();
    const contentHash = await options.hashFile(pick.file);
    options.signal.throwIfAborted();
    checkedPicks.set(pick.clientRef, contentHash);
    options.onChecked?.(position + 1);
  }, Promise.resolve());
  const matches: UploadRecoveryMatches = {
    knownMatches: [],
    ambiguous: [],
    alreadyUpClientRefs: [],
    refusedClientRefs: [],
    unmatchedClientRefs: [],
  };
  options.signal.throwIfAborted();
  const indexes = _getMatchIndexesFromRows(options.rows);
  _indexUnmatchedPickedHashes({ options, checkedPicks, indexes });
  options.picks.forEach((pick) => {
    options.signal.throwIfAborted();
    const row = indexes.rowsByHash.get(checkedPicks.get(pick.clientRef)!);
    if (row) {
      _recordMatch({ matches, row, clientRef: pick.clientRef });
    } else {
      _recordHashlessMatch({ matches, pick, indexes });
    }
  });
  return matches;
}

function _getMatchIndexesFromRows(
  rows: readonly UploadFileDto[],
): ResumeMatchIndexes {
  const indexes: ResumeMatchIndexes = {
    rowsByHash: new Map(),
    hashlessRowsByMetadata: new Map(),
    unmatchedHashesByMetadata: new Map(),
  };
  rows.forEach((row) => {
    const contentHash = row.contentHash;
    if (contentHash !== null) {
      const existingRow = indexes.rowsByHash.get(contentHash);
      if (
        !existingRow ||
        (existingRow.state !== "done" && row.state === "done")
      ) {
        indexes.rowsByHash.set(contentHash, row);
      }
      return;
    }
    const metadataKey = _getMetadataKeyFromFields({
      filename: row.originalFilename,
      byteSize: row.declaredBytes,
      contentType: row.declaredContentType,
    });
    const candidates = indexes.hashlessRowsByMetadata.get(metadataKey) ?? [];
    candidates.push(row);
    indexes.hashlessRowsByMetadata.set(metadataKey, candidates);
  });
  return indexes;
}

function _indexUnmatchedPickedHashes(
  options: Readonly<{
    options: Readonly<ResumeMatchOptions>;
    checkedPicks: ReadonlyMap<string, string>;
    indexes: ResumeMatchIndexes;
  }>,
): void {
  const { indexes, checkedPicks } = options;
  options.options.picks.forEach((pick) => {
    options.options.signal.throwIfAborted();
    const contentHash = checkedPicks.get(pick.clientRef)!;
    if (indexes.rowsByHash.has(contentHash)) {
      return;
    }
    const metadataKey = _getMetadataKeyFromFields({
      filename: pick.file.name,
      byteSize: pick.file.size,
      contentType: pick.file.type,
    });
    const hashes =
      indexes.unmatchedHashesByMetadata.get(metadataKey) ?? new Set();
    hashes.add(contentHash);
    indexes.unmatchedHashesByMetadata.set(metadataKey, hashes);
  });
}

function _recordHashlessMatch(
  options: Readonly<{
    matches: UploadRecoveryMatches;
    pick: Readonly<{ file: File; clientRef: string }>;
    indexes: ResumeMatchIndexes;
  }>,
): void {
  const { pick, matches, indexes } = options;
  const metadataKey = _getMetadataKeyFromFields({
    filename: pick.file.name,
    byteSize: pick.file.size,
    contentType: pick.file.type,
  });
  const candidates = indexes.hashlessRowsByMetadata.get(metadataKey) ?? [];
  const competingHashes = indexes.unmatchedHashesByMetadata.get(metadataKey);
  if (candidates.length === 1 && competingHashes?.size === 1) {
    _recordMatch({ matches, row: candidates[0]!, clientRef: pick.clientRef });
  } else if (candidates.length > 0) {
    matches.ambiguous.push({
      clientRef: pick.clientRef,
      fileIds: candidates.map((row) => {
        return row.fileId;
      }),
    });
  } else {
    matches.unmatchedClientRefs.push(pick.clientRef);
  }
}

function _getMetadataKeyFromFields(
  options: Readonly<{
    filename: string;
    byteSize: number;
    contentType: string;
  }>,
): string {
  return JSON.stringify([
    options.filename,
    options.byteSize,
    options.contentType,
  ]);
}

function _recordMatch(
  options: Readonly<{
    matches: UploadRecoveryMatches;
    row: UploadFileDto;
    clientRef: string;
  }>,
): void {
  const { matches, row, clientRef } = options;
  if (row.state === "done") {
    matches.alreadyUpClientRefs.push(clientRef);
  } else if (row.state === "refused" || row.state === "cancelled") {
    matches.refusedClientRefs.push(clientRef);
  } else {
    matches.knownMatches.push({ fileId: row.fileId, clientRef });
  }
}

/** Applies one explicit choice, excluding other bytes for the same row. */
export function makeRecoveryMatchesFromChoice(
  options: Readonly<RecoveryMatchChoiceOptions>,
): UploadRecoveryMatches {
  const { row, clientRef, contentHashesByRef } = options;
  const matches: UploadRecoveryMatches = {
    ...options.matches,
    knownMatches: [...options.matches.knownMatches],
    ambiguous: [],
    alreadyUpClientRefs: [...options.matches.alreadyUpClientRefs],
    refusedClientRefs: [...options.matches.refusedClientRefs],
    unmatchedClientRefs: [...options.matches.unmatchedClientRefs],
  };
  const selectedHash = contentHashesByRef.get(clientRef);
  options.matches.ambiguous.forEach((candidate) => {
    if (
      candidate.clientRef === clientRef ||
      (selectedHash &&
        contentHashesByRef.get(candidate.clientRef) === selectedHash)
    ) {
      _recordMatch({ matches, row, clientRef: candidate.clientRef });
      return;
    }
    const fileIds = candidate.fileIds.filter((fileId) => {
      return fileId !== row.fileId;
    });
    if (fileIds.length === 0) {
      matches.unmatchedClientRefs.push(candidate.clientRef);
    } else {
      matches.ambiguous.push({ ...candidate, fileIds });
    }
  });
  return matches;
}
