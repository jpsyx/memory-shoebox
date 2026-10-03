import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";

import {
  type ProofTiming,
  type UploadProofState,
} from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

/** The routes the harness drives itself; the engine has its own two. */
export type UploadProofApi = Pick<
  typeof import("@/api/uploadsHelpers/uploadsHelpers"),
  | "getCurrentUploadSession"
  | "openUploadSession"
  | "putUploadManifest"
  | "commitUploadSession"
>;

/** Everything a run reaches outside itself. Injectable for tests. */
export type UploadProofDependencies = {
  api: UploadProofApi;
  createEngine: typeof createUploadEngine;
  now: () => number;
  /** Bytes of JS heap in use, where the browser will say. */
  readHeapBytes: () => number | undefined;
  /** The whole-file hash a resume's entries carry. */
  makeSha256HexFromBlob: typeof makeSha256HexFromBlob;
};

/** One run's inputs. `state` is advanced in place. */
export type UploadProofRun = {
  state: UploadProofState;
  files: File[];
  /** `before-commit` waits for `state.release()` before committing. */
  hold: "before-commit" | undefined;
  onLog?: (line: string) => void;
  /** Entries per manifest call. `UPLOAD_LIMITS.manifestEntriesPerRequest`. */
  batchSize?: number;
  dependencies?: Partial<UploadProofDependencies>;
};

/** The run with every default filled in, as the phases see it. */
export type RunContext = {
  run: UploadProofRun;
  dependencies: UploadProofDependencies;
  log: (line: string) => void;
  timings: Map<string, ProofTiming>;
};
