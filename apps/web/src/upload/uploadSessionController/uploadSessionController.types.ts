import type {
  CreateUploadEditRequest,
  UploadFileState,
  UploadProblemCode,
  UploadSessionDetail,
} from "@memory-shoebox/shared";

/** Surface phase; component modal inputs remain outside this shared state. */
export type UploadPhase =
  | "idle"
  | "loading"
  | "declaring"
  | "draft"
  | "checking"
  | "resume"
  | "sending"
  | "partial"
  | "done"
  | "unavailable";

/** Browser-only activity, distinct from the server's manifest file state. */
export type UploadFileActivity =
  | { kind: "preparing" }
  | { kind: "transferring"; sentBytes: number; totalBytes: number }
  | { kind: "confirmed"; state: UploadFileState }
  | { kind: "duplicate" }
  | { kind: "unconfirmed"; problemCode: UploadProblemCode; detail: string };

/** Known per-file markers keyed by actual server edit ids. */
export type UploadEditTargets = Map<string, string[]>;

/** Re-picked files, associated by client reference rather than filename. */
export type UploadRecoveryMatches = {
  knownMatches: Array<{ fileId: string; clientRef: string }>;
  /** Candidates needing an explicit uploader association before sending. */
  ambiguous: Array<{ fileIds: string[]; clientRef: string }>;
  alreadyUpClientRefs: string[];
  refusedClientRefs: string[];
  unmatchedClientRefs: string[];
};

/** An operation failure retained so a form caller can preserve its input. */
export type UploadOperationError = {
  operation: string;
  code?: string;
  message: string;
};

/** Server detail and browser-owned handles, markers and current operation. */
export type UploadSnapshot = {
  phase: UploadPhase;
  /** Only publish a complete session read, never an unfinished page set. */
  detail?: UploadSessionDetail;
  filesById: Map<string, File>;
  selectedFileIds: Set<string>;
  fileActivityById: Map<string, UploadFileActivity>;
  editTargets: UploadEditTargets;
  /** Successfully declared picks and the current declaration's total. */
  declaredCount: number;
  declarationTotal: number;
  /** Checked recovery picks and the current checking operation's total. */
  checkingCount: number;
  checkingTotal: number;
  recoveryMatches: UploadRecoveryMatches;
  isBusy: boolean;
  isRunning: boolean;
  error?: UploadOperationError;
};

/** A label write whose targets are captured by the controller action. */
export type UploadDraftLabel = Omit<CreateUploadEditRequest, "targetFileIds">;

/** Calendar day amendment; the server preserves the original capture clock. */
export type UploadDateChoice = { fileId: string; capturedOn: string };

/** Optional versioned markers and last-session pointer, never media bytes. */
export type UploadRecoveryHint = {
  version: 1;
  sessionId: string;
  editTargets: Record<string, string[]>;
};

/** Browser storage dependency; implementations may throw on every method. */
export type UploadRecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
