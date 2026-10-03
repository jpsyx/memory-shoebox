import type { UploadFileDto } from "@memory-shoebox/shared";
import type { UploadRecoveryMatches } from "../uploadSessionController.types";
import type {
  RecoveryMatchChoiceOptions,
  ResumeMatchOptions,
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
  options.picks.forEach((pick) => {
    const contentHash = checkedPicks.get(pick.clientRef)!;
    const exact = options.rows.filter((row) => {
      return row.contentHash === contentHash;
    });
    if (exact.length > 0) {
      const row =
        exact.find((file) => {
          return file.state === "done";
        }) ?? exact[0]!;
      _recordMatch({ matches, row, clientRef: pick.clientRef });
      return;
    }
    _recordHashlessMatch({ options, pick, checkedPicks, matches });
  });
  return matches;
}

function _recordHashlessMatch(
  options: Readonly<{
    options: Readonly<ResumeMatchOptions>;
    pick: Readonly<{ file: File; clientRef: string }>;
    checkedPicks: ReadonlyMap<string, string>;
    matches: UploadRecoveryMatches;
  }>,
): void {
  const { pick, matches, checkedPicks } = options;
  const candidates = options.options.rows.filter((row) => {
    return (
      row.contentHash === null &&
      row.originalFilename === pick.file.name &&
      row.declaredBytes === pick.file.size &&
      row.declaredContentType === pick.file.type
    );
  });
  const competingHashes = new Set(
    options.options.picks
      .filter((otherPick) => {
        const hasExactMatch = options.options.rows.some((row) => {
          return row.contentHash === checkedPicks.get(otherPick.clientRef);
        });
        return (
          !hasExactMatch &&
          otherPick.file.name === pick.file.name &&
          otherPick.file.size === pick.file.size &&
          otherPick.file.type === pick.file.type
        );
      })
      .map((otherPick) => {
        return checkedPicks.get(otherPick.clientRef);
      }),
  );
  if (candidates.length === 1 && competingHashes.size === 1) {
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
