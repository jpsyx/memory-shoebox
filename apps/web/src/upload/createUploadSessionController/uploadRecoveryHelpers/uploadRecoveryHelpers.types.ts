import type { UploadFileDto } from "@memory-shoebox/shared";
import type { UploadRecoveryMatches } from "../createUploadSessionController.types";

/** Full manifest and worker hash boundary for serial identity checks. */
export type ResumeMatchOptions = {
  picks: ReadonlyArray<Readonly<{ clientRef: string; file: File }>>;
  rows: readonly UploadFileDto[];
  hashFile: (file: Blob) => Promise<string>;
  signal: AbortSignal;
  onChecked?: (checkedFileCount: number) => void;
};

/** A chosen association, with checked hashes to distinguish competing picks. */
export type RecoveryMatchChoiceOptions = {
  matches: UploadRecoveryMatches;
  row: UploadFileDto;
  clientRef: string;
  contentHashesByRef: ReadonlyMap<string, string | undefined>;
};

/** Recovery identity indexes built once for each complete checked batch. */
export type ResumeMatchIndexes = {
  rowsByHash: Map<string, UploadFileDto>;
  hashlessRowsByMetadata: Map<string, UploadFileDto[]>;
  unmatchedHashesByMetadata: Map<string, Set<string>>;
};
