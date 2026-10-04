import type {
  CreateUploadEditRequest,
  SetUploadVisibilityRequest,
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
export type UploadFileActivity = {
  /** Retry answers decide whether this file joins the batch notification. */
  isIncludedInEmail?: boolean;
} & (
  | { kind: "preparing" }
  | { kind: "transferring"; sentBytes: number; totalBytes: number }
  | { kind: "confirmed"; state: UploadFileState }
  | { kind: "duplicate" }
  | { kind: "unconfirmed"; problemCode: UploadProblemCode; detail: string }
);

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
  /** Browser-only incoming identity; never written to recovery storage. */
  recoveryFilesByRef?: ReadonlyMap<string, { file: File; ordinal: number }>;
  isBusy: boolean;
  isRunning: boolean;
  error?: UploadOperationError;
};

/** A label write whose targets are captured by the controller action. */
export type UploadDraftLabel = Omit<CreateUploadEditRequest, "targetFileIds">;

/** An immutable submitted action; reuse its identity for explicit chunk retry. */
export type UploadEditAttempt = Readonly<{
  sessionId: string;
  labels: readonly UploadDraftLabel[];
  targetFileIds: readonly string[];
  preserveSelection?: boolean;
}>;

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

/** The existing route clients available to controller actions. */
export type UploadSessionApi = Pick<
  typeof import("@/api/uploadsHelpers/uploadsHelpers"),
  | "openUploadSession"
  | "getCurrentUploadSession"
  | "getUploadSession"
  | "putUploadManifest"
  | "cancelUploadSession"
  | "commitUploadSession"
  | "presignUploadFile"
  | "completeUploadFile"
  | "retryUploadFile"
  | "setUploadVisibility"
  | "createUploadEdit"
  | "undoUploadEdit"
>;

/** Controller dependencies default to the existing upload implementations. */
export type CreateUploadSessionControllerOptions = {
  memberId: string;
  api?: UploadSessionApi;
  getManifestEntryFromFile?: typeof import("@/upload/getManifestEntryFromFile/getManifestEntryFromFile").getManifestEntryFromFile;
  createUploadEngine?: typeof import("@/upload/createUploadEngine/createUploadEngine").createUploadEngine;
  createMediaWorker?: () => import("@/upload/mediaWorker/mediaWorkerProtocol.types").MediaWorkerPort;
  storage?: UploadRecoveryStorage;
};

/** Session actions; later tasks add implemented recovery and edit actions. */
export type UploadSessionController = {
  /** Stable until a change is published. */
  getSnapshot: () => UploadSnapshot;
  /** Observes snapshot changes; the returned function removes the listener. */
  subscribe: (listener: () => void) => () => void;
  /** Reads the addressed or current batch without opening a draft. */
  loadSession: (sessionId?: string) => Promise<void>;
  /** Declares picks, or continues retained undeclared picks with an empty list. */
  pickFiles: (files: readonly File[]) => Promise<void>;
  /** Retries selected failed rows with retained handles, awaiting transfer. */
  retryMissingFiles: (fileIds: readonly string[]) => Promise<void>;
  /** Chooses an ambiguous association before declaration or transfer. */
  confirmRecoveryMatch: (
    options: Readonly<{ fileId: string; clientRef: string }>,
  ) => Promise<void>;
  /** Skips an ambiguous incoming original, leaving its saved row missing. */
  skipRecoveryMatch: (clientRef: string) => Promise<void>;
  /** Saves sequential labels against one captured eligible selection. */
  applyEdits: (labels: readonly UploadDraftLabel[]) => Promise<void>;
  /** Applies retained explicit targets without replacing the current selection. */
  applyEditAttempt: (attempt: UploadEditAttempt) => Promise<void>;
  /** Removes a reversible saved edit only after its server answer. */
  undoEdit: (editId: string) => Promise<void>;
  /** Amends known manifest rows with calendar dates, without reading Files. */
  amendDates: (choices: readonly UploadDateChoice[]) => Promise<void>;
  /** Toggles a waiting draft row as an edit target. */
  toggleFile: (fileId: string) => void;
  /** Selects every waiting draft row on a server capture day. */
  selectDay: (capturedOn: string) => void;
  /** Selects all waiting draft rows, including offscreen rows. */
  selectAll: () => void;
  /** Clears edit targets without changing the manifest. */
  clearSelection: () => void;
  /** Saves visibility, arms once and awaits the entire local engine run. */
  startUpload: (
    visibility: Readonly<SetUploadVisibilityRequest>,
  ) => Promise<void>;
  /** Cancels local sending, then closes the uploading server batch. */
  closeBatch: () => Promise<void>;
  /** Deletes only a draft batch, then releases local state. */
  cancelDraft: () => Promise<void>;
  /** Releases local state and invalidates pending operations. */
  reset: () => void;
  /** Releases local work and listeners without a server cancellation. */
  destroy: () => void;
};

/** A picked handle retains its reference and headers across declaration retry. */
export type UploadPendingPick = {
  file: File;
  clientRef: string;
  entry?: import("@memory-shoebox/shared").ManifestEntry;
};

/** Controller-owned resources shared by focused action helpers. */
export type UploadControllerContext = {
  dependencies: Required<CreateUploadSessionControllerOptions>;
  state: {
    snapshot: UploadSnapshot;
    generation: number;
    isDestroyed: boolean;
    pendingPicks: UploadPendingPick[];
    /** A successful declaration still needs an authoritative detail read. */
    needsDeclarationRead: boolean;
    listeners: Set<() => void>;
    /** Retained recovery picks and hashes survive a failed checking attempt. */
    recoveryPicks?: Map<string, { file: File; contentHash?: string }>;
    /** Cancels serial hash checking and its worker on reset or close. */
    cancelRecoveryChecking?: () => void;
    /** Cancels an unpublished byte-event frame on reset or close. */
    cancelTransferProgress?: () => void;
    engine?: import("@/upload/createUploadEngine/createUploadEngine.types").UploadEngine;
  };
  publish: (snapshot: UploadSnapshot) => void;
  isCurrent: (generation: number) => boolean;
};
