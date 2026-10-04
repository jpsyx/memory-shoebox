import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
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
import {
  cancelUploadDraft,
  declareUploadPicks,
} from "./uploadDeclarationHelpers";
import { makeEditActionsFromContext } from "./uploadEditHelpers";
import {
  makeIdleUploadSnapshot,
  releaseUploadBatchLocally,
} from "./uploadIdleSnapshotHelpers";
import {
  getPhaseFromUploadDetail,
  loadUploadSession,
} from "./uploadManifestReadHelpers";
import {
  checkUploadRecovery,
  confirmUploadRecoveryMatch,
  retryMissingUploadFiles,
  skipUploadRecoveryMatch,
} from "./uploadRecoveryActions/uploadRecoveryActions";
import { clearUploadRecoveryHint } from "./uploadRecoveryStorage/uploadRecoveryStorage";
import { makeSelectionActionsFromContext } from "./uploadSelectionHelpers";
import type {
  CreateUploadSessionControllerOptions,
  UploadControllerContext,
  UploadSessionApi,
  UploadSessionController,
} from "./uploadSessionController.types";
import {
  armUploadSession,
  closeUploadBatch,
  runUploadTransfer,
} from "./uploadTransferHelpers";

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

function _makeDraftActionsFromContext(
  context: Readonly<UploadControllerContext>,
): Pick<UploadSessionController, "loadSession" | "pickFiles" | "cancelDraft"> {
  const run = (
    operation: string,
    action: (generation: number) => Promise<void>,
  ) => {
    return _runOperation({ context, operation, action });
  };
  return {
    loadSession: (sessionId) => {
      if (
        context.state.snapshot.isRunning &&
        (!sessionId || sessionId === context.state.snapshot.detail?.sessionId)
      ) {
        return Promise.resolve();
      }
      return run("load", (generation) => {
        return loadUploadSession({ context, generation, sessionId });
      });
    },
    pickFiles: (files) => {
      return run("declare", (generation) => {
        return _pickFilesForBatch({ context, generation, files });
      });
    },
    cancelDraft: () => {
      return run("cancel", (generation) => {
        return cancelUploadDraft({
          context,
          generation,
          onCancelled: () => {
            _resetContext(context);
          },
        });
      });
    },
  };
}

function _pickFilesForBatch(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    files: readonly File[];
  }>,
): Promise<void> {
  const snapshot = options.context.state.snapshot;
  const needsRecovery =
    snapshot.detail &&
    (snapshot.detail.state !== "draft" ||
      snapshot.detail.files.some((file) => {
        return file.state === "waiting" && !snapshot.filesById.has(file.fileId);
      }));
  return needsRecovery
    ? checkUploadRecovery(options)
    : declareUploadPicks(options);
}

function _makeTransferActionsFromContext(
  context: Readonly<UploadControllerContext>,
): Pick<UploadSessionController, "startUpload" | "closeBatch"> {
  return {
    startUpload: (visibility) => {
      return _runOperation({
        context,
        operation: "upload",
        action: async (generation) => {
          await armUploadSession({ context, generation, visibility });
          if (context.isCurrent(generation)) {
            await runUploadTransfer({ context, generation });
          }
        },
      });
    },
    closeBatch: () => {
      return _runOperation({
        context,
        operation: "close",
        action: (generation) => {
          return closeUploadBatch({ context, generation });
        },
      });
    },
  };
}

function _makeRecoveryActionsFromContext(
  context: Readonly<UploadControllerContext>,
): Pick<
  UploadSessionController,
  "retryMissingFiles" | "confirmRecoveryMatch" | "skipRecoveryMatch"
> {
  return {
    retryMissingFiles: (fileIds) => {
      return _runOperation({
        context,
        operation: "retry",
        action: (generation) => {
          return retryMissingUploadFiles({ context, generation, fileIds });
        },
      });
    },
    skipRecoveryMatch: (clientRef) => {
      return _runOperation({
        context,
        operation: "recover",
        action: (generation) => {
          return skipUploadRecoveryMatch({ context, generation, clientRef });
        },
      });
    },
    confirmRecoveryMatch: (match) => {
      return _runOperation({
        context,
        operation: "recover",
        action: (generation) => {
          return confirmUploadRecoveryMatch({ context, generation, ...match });
        },
      });
    },
  };
}

function _makeContextFromOptions(
  options: Readonly<CreateUploadSessionControllerOptions>,
): UploadControllerContext {
  const state: UploadControllerContext["state"] = {
    snapshot: makeIdleUploadSnapshot(),
    generation: 0,
    isDestroyed: false,
    pendingPicks: [],
    needsDeclarationRead: false,
    listeners: new Set(),
  };
  return {
    dependencies: _makeDependenciesFromOptions(options),
    state,
    publish: (snapshot) => {
      if (!state.isDestroyed && snapshot !== state.snapshot) {
        state.snapshot = snapshot;
        state.listeners.forEach((listener) => {
          listener();
        });
      }
    },
    isCurrent: (generation) => {
      return !state.isDestroyed && generation === state.generation;
    },
  };
}

function _makeDependenciesFromOptions(
  options: Readonly<CreateUploadSessionControllerOptions>,
): Required<CreateUploadSessionControllerOptions> {
  return {
    memberId: options.memberId,
    api: options.api ?? DEFAULT_UPLOAD_API,
    getManifestEntryFromFile:
      options.getManifestEntryFromFile ?? getManifestEntryFromFile,
    createUploadEngine: options.createUploadEngine ?? createUploadEngine,
    createMediaWorker:
      options.createMediaWorker ??
      (() => {
        return new Worker(
          new URL("../mediaWorker/mediaWorker.ts", import.meta.url),
          { type: "module" },
        );
      }),
    storage: options.storage ?? _makeDefaultStorage(),
  };
}

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

function _resetContext(context: Readonly<UploadControllerContext>): void {
  _releaseLocalWork(context);
  clearUploadRecoveryHint(context.dependencies);
}

function _releaseLocalWork(context: Readonly<UploadControllerContext>): void {
  context.state.generation += 1;
  releaseUploadBatchLocally({ context });
}

async function _runOperation(
  options: Readonly<{
    context: UploadControllerContext;
    operation: string;
    action: (generation: number) => Promise<void>;
  }>,
): Promise<void> {
  const { context, operation } = options;
  _assertAvailable({ context, operation });
  const generation = ++context.state.generation;
  context.publish({
    ...context.state.snapshot,
    isBusy: true,
    error: undefined,
  });
  try {
    await options.action(generation);
  } catch (error) {
    if (!context.isCurrent(generation)) {
      return;
    }
    _recordOperationError({ context, operation, error });
    throw error;
  } finally {
    if (context.isCurrent(generation)) {
      context.publish({ ...context.state.snapshot, isBusy: false });
    }
  }
}

function _assertAvailable(
  options: Readonly<{ context: UploadControllerContext; operation: string }>,
): void {
  const { context, operation } = options;
  if (context.state.isDestroyed) {
    throw new Error("Upload controller is destroyed.");
  }
  if (
    operation === "close" &&
    context.state.snapshot.detail?.state !== "uploading"
  ) {
    const error = new Error("Only an uploading batch can be closed.");
    _recordOperationError({ context, operation, error });
    throw error;
  }
  if (
    (context.state.snapshot.isBusy && operation !== "close") ||
    (context.state.snapshot.isRunning && operation !== "close")
  ) {
    const error = new Error("Upload controller is busy.");
    context.publish({
      ...context.state.snapshot,
      error: {
        operation,
        code: "upload_controller_busy",
        message: error.message,
      },
    });
    throw error;
  }
}

function _recordOperationError(
  options: Readonly<{
    context: UploadControllerContext;
    operation: string;
    error: unknown;
  }>,
): void {
  const { context, operation, error } = options;
  const snapshot = context.state.snapshot;
  context.publish({
    ...snapshot,
    phase: snapshot.isRunning
      ? snapshot.phase
      : operation === "upload" && snapshot.phase === "partial"
        ? "partial"
        : snapshot.detail
          ? getPhaseFromUploadDetail(snapshot.detail)
          : "unavailable",
    error: {
      operation,
      code: error instanceof ApiRequestError ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

/** Owns local handles and subscriptions without starting work on construction. */
export function createUploadSessionController(
  options: Readonly<CreateUploadSessionControllerOptions>,
): UploadSessionController {
  const context = _makeContextFromOptions(options);
  const reset = () => {
    _resetContext(context);
  };
  return {
    getSnapshot: () => {
      return context.state.snapshot;
    },
    subscribe: (listener) => {
      if (!context.state.isDestroyed) {
        context.state.listeners.add(listener);
      }
      return () => {
        context.state.listeners.delete(listener);
      };
    },
    ..._makeDraftActionsFromContext(context),
    ...makeSelectionActionsFromContext(context),
    ..._makeTransferActionsFromContext(context),
    ..._makeRecoveryActionsFromContext(context),
    ...makeEditActionsFromContext({
      context,
      run: (operation, action) => {
        return _runOperation({ context, operation, action });
      },
    }),
    reset,
    destroy: () => {
      if (context.state.isDestroyed) {
        return;
      }
      context.state.listeners.clear();
      _releaseLocalWork(context);
      context.state.isDestroyed = true;
    },
  };
}
