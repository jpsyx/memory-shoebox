import {
  commitUploadSession,
  getCurrentUploadSession,
  openUploadSession,
  putUploadManifest,
} from "@/api/uploadsHelpers/uploadsHelpers";

import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import { makeSha256HexFromBlob } from "@/upload/makeSha256HexFromBlob/makeSha256HexFromBlob";

import type { UploadProofDependencies } from "./runUploadProof.types";

import { readChromeHeapBytes } from "./readChromeHeapBytes";

/**
 * Production API, engine and clock dependencies used by the proof harness.
 */
export const DEFAULT_DEPENDENCIES: UploadProofDependencies = {
  api: {
    getCurrentUploadSession,
    openUploadSession,
    putUploadManifest,
    commitUploadSession,
  },
  createEngine: createUploadEngine,
  now: () => {
    return performance.now();
  },
  readHeapBytes: readChromeHeapBytes,
  makeSha256HexFromBlob,
};
