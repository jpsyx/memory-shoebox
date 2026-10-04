import type { UploadFileDto } from "@memory-shoebox/shared";
import type { UploadRecoveryMatches } from "../createUploadSessionController.types";
import type {
  RecoveryMatchChoiceOptions,
  ResumeMatchIndexes,
  ResumeMatchOptions,
} from "./uploadRecoveryHelpers.types";

type PickMatch = { clientRef: string } & (
  | { kind: "known"; fileId: string }
  | { kind: "ambiguous"; fileIds: string[] }
  | { kind: "up" | "refused" | "unmatched" }
);

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
  options.signal.throwIfAborted();
  const indexes = _getMatchIndexesFromRows(options.rows);
  _indexUnmatchedPickedHashes({ options, checkedPicks, indexes });
  const classifications = options.picks.map((pick) => {
    options.signal.throwIfAborted();
    const row = indexes.rowsByHash.get(checkedPicks.get(pick.clientRef)!);
    return row
      ? _getMatchFromRow({ row, clientRef: pick.clientRef })
      : _getHashlessMatch({ pick, indexes });
  });
  return _getMatchesFromClassifications(classifications);
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

function _getHashlessMatch({
  pick,
  indexes,
}: Readonly<{
  pick: Readonly<{ file: File; clientRef: string }>;
  indexes: ResumeMatchIndexes;
}>): PickMatch {
  const metadataKey = _getMetadataKeyFromFields({
    filename: pick.file.name,
    byteSize: pick.file.size,
    contentType: pick.file.type,
  });
  const candidates = indexes.hashlessRowsByMetadata.get(metadataKey) ?? [];
  const competingHashes = indexes.unmatchedHashesByMetadata.get(metadataKey);
  return candidates.length === 1 && competingHashes?.size === 1
    ? _getMatchFromRow({ row: candidates[0]!, clientRef: pick.clientRef })
    : candidates.length > 0
      ? {
          kind: "ambiguous",
          clientRef: pick.clientRef,
          fileIds: candidates.map((row) => {
            return row.fileId;
          }),
        }
      : { kind: "unmatched", clientRef: pick.clientRef };
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

function _getMatchFromRow({
  row,
  clientRef,
}: Readonly<{ row: UploadFileDto; clientRef: string }>): PickMatch {
  return row.state === "done"
    ? { kind: "up", clientRef }
    : row.state === "refused" || row.state === "cancelled"
      ? { kind: "refused", clientRef }
      : { kind: "known", fileId: row.fileId, clientRef };
}
function _getMatchesFromClassifications(
  classifications: readonly PickMatch[],
): UploadRecoveryMatches {
  return {
    knownMatches: classifications.flatMap((match) => {
      return match.kind === "known"
        ? [{ fileId: match.fileId, clientRef: match.clientRef }]
        : [];
    }),
    ambiguous: classifications.flatMap((match) => {
      return match.kind === "ambiguous"
        ? [{ clientRef: match.clientRef, fileIds: match.fileIds }]
        : [];
    }),
    alreadyUpClientRefs: classifications.flatMap((match) => {
      return match.kind === "up" ? [match.clientRef] : [];
    }),
    refusedClientRefs: classifications.flatMap((match) => {
      return match.kind === "refused" ? [match.clientRef] : [];
    }),
    unmatchedClientRefs: classifications.flatMap((match) => {
      return match.kind === "unmatched" ? [match.clientRef] : [];
    }),
  };
}

/** Applies one explicit choice, excluding other bytes for the same row. */
export function makeRecoveryMatchesFromChoice(
  options: Readonly<RecoveryMatchChoiceOptions>,
): UploadRecoveryMatches {
  const { row, clientRef, contentHashesByRef } = options;
  const selectedHash = contentHashesByRef.get(clientRef);
  const classifications = options.matches.ambiguous.map(
    (candidate): PickMatch => {
      if (
        candidate.clientRef === clientRef ||
        (selectedHash &&
          contentHashesByRef.get(candidate.clientRef) === selectedHash)
      ) {
        return _getMatchFromRow({ row, clientRef: candidate.clientRef });
      }
      const fileIds = candidate.fileIds.filter((fileId) => {
        return fileId !== row.fileId;
      });
      return fileIds.length === 0
        ? { kind: "unmatched", clientRef: candidate.clientRef }
        : { kind: "ambiguous", clientRef: candidate.clientRef, fileIds };
    },
  );
  const addedMatches = _getMatchesFromClassifications(classifications);
  return {
    ...options.matches,
    knownMatches: [
      ...options.matches.knownMatches,
      ...addedMatches.knownMatches,
    ],
    ambiguous: addedMatches.ambiguous,
    alreadyUpClientRefs: [
      ...options.matches.alreadyUpClientRefs,
      ...addedMatches.alreadyUpClientRefs,
    ],
    refusedClientRefs: [
      ...options.matches.refusedClientRefs,
      ...addedMatches.refusedClientRefs,
    ],
    unmatchedClientRefs: [
      ...options.matches.unmatchedClientRefs,
      ...addedMatches.unmatchedClientRefs,
    ],
  };
}
