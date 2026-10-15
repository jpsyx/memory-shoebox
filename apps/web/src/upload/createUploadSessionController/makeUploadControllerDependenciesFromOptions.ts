import { createUploadDecodeCoordinator } from "@/upload/createUploadDecodeCoordinator";
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
  removeUploadFiles,
  setUploadFileBurst,
  setUploadVisibility,
  undoUploadEdit,
} from "@/api/uploadsHelpers/uploadsHelpers";

import { createUploadOriginalStore } from "@/upload/createUploadOriginalStore/createUploadOriginalStore";

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
  removeUploadFiles,
  setUploadFileBurst,
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
  decodeCoordinator = createUploadDecodeCoordinator(),
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
  originalStore = createUploadOriginalStore(),
  onBurstChanged = () => {},
  memberId,
}: Readonly<CreateUploadSessionControllerOptions>): Required<CreateUploadSessionControllerOptions> {
  return {
    memberId: memberId,
    decodeCoordinator,
    api: api,
    getManifestEntryFromFile: getManifestEntryFromFileDependency,
    createUploadEngine: createUploadEngineDependency,
    createMediaWorker: createMediaWorker,
    storage: storage,
    originalStore,
    onBurstChanged,
  };
}
