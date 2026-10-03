import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
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
} from "@/api/uploadsHelpers/uploadsHelpers";
import { createUploadEngine } from "@/upload/createUploadEngine/createUploadEngine";
import { getManifestEntryFromFile } from "@/upload/getManifestEntryFromFile/getManifestEntryFromFile";
import {
  makeIdleUploadSnapshot,
  releaseUploadBatchLocally,
} from "./uploadIdleSnapshotHelpers";
import { clearUploadRecoveryHint } from "./uploadRecoveryStorage/uploadRecoveryStorage";
import {
  loadUploadSession,
  declareUploadPicks,
  cancelUploadDraft,
  getPhaseFromUploadDetail,
} from "./uploadDeclarationHelpers";
import { makeSelectionActionsFromContext } from "./uploadSelectionHelpers";
import type {
  CreateUploadSessionControllerOptions,
  UploadControllerContext,
  UploadSessionController,
  UploadSessionApi,
} from "./uploadSessionController.types";

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
      return run("load", (generation) => {
        return loadUploadSession({ context, generation, sessionId });
      });
    },
    pickFiles: (files) => {
      return run("declare", (generation) => {
        return declareUploadPicks({ context, generation, files });
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
  if (context.state.snapshot.isBusy) {
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
    phase: snapshot.detail
      ? getPhaseFromUploadDetail(snapshot.detail)
      : "unavailable",
    error: {
      operation,
      code: error instanceof ApiRequestError ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error),
    },
  });
}
