import {
  cancelUploadSession,
  commitUploadSession,
  completeUploadFile,
  createUploadEdit,
  getCurrentUploadSession,
  getUploadSession,
  openUploadSession,
  presignUploadFile,
  putUploadManifest,
  retryUploadFile,
  setUploadVisibility,
  undoUploadEdit,
} from "@/api/uploadsHelpers/uploadsHelpers";

import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";

import { getManifestEntryFromFile } from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";
import type {
  CreateUploadSessionControllerOptions,
  UploadSessionApi,
} from "./createUploadSessionController.types";

const DEFAULT_UPLOAD_API: UploadSessionApi = {
  openUploadSession,
  getCurrentUploadSession,
  getUploadSession,
  putUploadManifest,
  cancelUploadSession,
  commitUploadSession,
  presignUploadFile,
  completeUploadFile,
  retryUploadFile,
  setUploadVisibility,
  createUploadEdit,
  undoUploadEdit,
};

function _makeDefaultStorage(): Required<CreateUploadSessionControllerOptions>["storage"] {
  return {
    getItem: (key) => {
      return globalThis.localStorage.getItem(key);
    },
    setItem: (key, value) => {
      globalThis.localStorage.setItem(key, value);
    },
    removeItem: (key) => {
      globalThis.localStorage.removeItem(key);
    },
  };
}

/** Returns browser upload dependencies with optional overrides applied. */
export function makeUploadControllerDependenciesFromOptions({
  api = DEFAULT_UPLOAD_API,
  getManifestEntryFromFile:
    getManifestEntryFromFileDependency = getManifestEntryFromFile,
  createUploadEngine: createUploadEngineDependency = createUploadEngine,
  createMediaWorker = () => {
    return new Worker(
      new URL("../mediaWorker/mediaWorker.ts", import.meta.url),
      { type: "module" },
    );
  },
  storage = _makeDefaultStorage(),
  memberId,
}: Readonly<CreateUploadSessionControllerOptions>): Required<CreateUploadSessionControllerOptions> {
  return {
    memberId: memberId,
    api: api,
    getManifestEntryFromFile: getManifestEntryFromFileDependency,
    createUploadEngine: createUploadEngineDependency,
    createMediaWorker: createMediaWorker,
    storage: storage,
  };
}
