import type { UploadSessionController } from "../createUploadSessionController/createUploadSessionController.types";
import type { UploadFileIntake } from "./createUploadFileIntake.types";

function _waitForUploadReadiness(
  controller: Readonly<UploadSessionController>,
): Promise<void> {
  if (!controller.getSnapshot().isBusy || controller.getSnapshot().isRunning) {
    return Promise.resolve();
  }
  return new Promise((finish) => {
    const unsubscribe = controller.subscribe(() => {
      if (
        !controller.getSnapshot().isBusy ||
        controller.getSnapshot().isRunning
      ) {
        unsubscribe();
        finish();
      }
    });
  });
}

type IntakeState = {
  pendingFiles: File[];
  generation: number;
  retainedSessionId?: string;
  activeRead:
    | {
        address: string | undefined;
        promise: Promise<void>;
        generation: number;
      }
    | undefined;
};

function _clearIntakeState(state: IntakeState): void {
  state.generation += 1;
  state.pendingFiles = [];
  state.retainedSessionId = undefined;
}

async function _discardStaleUploadDraft(
  controller: Readonly<UploadSessionController>,
  state: IntakeState,
): Promise<void> {
  const snapshot = controller.getSnapshot();
  const detail = snapshot.detail;
  if (detail?.state === "cancelled") {
    controller.reset();
  } else if (
    detail?.state === "draft" &&
    state.retainedSessionId !== detail.sessionId &&
    snapshot.filesById.size === 0
  ) {
    await controller.cancelDraft();
  }
  state.retainedSessionId = controller.getSnapshot().detail?.sessionId;
}

async function _readAndPick(
  controller: Readonly<UploadSessionController>,
  state: IntakeState,
  sessionId?: string,
): Promise<void> {
  const generation = state.generation;
  if (controller.getSnapshot().isBusy && !controller.getSnapshot().isRunning) {
    await _waitForUploadReadiness(controller);
  }
  if (generation !== state.generation) {
    return;
  }
  await controller.loadSession(sessionId);
  if (generation !== state.generation) {
    return;
  }
  await _discardStaleUploadDraft(controller, state);
  while (
    state.pendingFiles.length > 0 &&
    generation === state.generation &&
    !controller.getSnapshot().isRunning &&
    controller.getSnapshot().recoveryMatches.ambiguous.length === 0
  ) {
    const batchState = controller.getSnapshot().detail?.state;
    if (batchState === "settled" || batchState === "cancelled") {
      controller.reset();
      await controller.loadSession();
    }
    const files = state.pendingFiles;
    state.pendingFiles = [];
    await controller.pickFiles(files);
    state.retainedSessionId = controller.getSnapshot().detail?.sessionId;
  }
}

function _makeLoadSessionFromIntake(
  controller: Readonly<UploadSessionController>,
  state: IntakeState,
) {
  const loadSession = (sessionId?: string): Promise<void> => {
    if (state.activeRead) {
      if (state.activeRead.generation !== state.generation) {
        return state.activeRead.promise
          .catch(() => {})
          .then(() => {
            return loadSession(sessionId);
          });
      }
      return state.activeRead.address === sessionId
        ? state.activeRead.promise
        : state.activeRead.promise.then(() => {
            return loadSession(sessionId);
          });
    }
    const promise = _readAndPick(controller, state, sessionId).finally(() => {
      state.activeRead = undefined;
    });
    state.activeRead = {
      address: sessionId,
      promise,
      generation: state.generation,
    };
    return promise;
  };
  return loadSession;
}

function _resumeStagedDraftFiles(
  controller: Readonly<UploadSessionController>,
  state: IntakeState,
  loadSession: UploadFileIntake["loadSession"],
): void {
  let hadDraft = controller.getSnapshot().detail?.state === "draft";
  controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    if (hadDraft && snapshot.phase === "idle" && !state.activeRead) {
      _clearIntakeState(state);
    }
    hadDraft = snapshot.detail?.state === "draft";
    if (
      !state.activeRead &&
      state.pendingFiles.length > 0 &&
      !snapshot.isBusy &&
      !snapshot.isRunning &&
      !snapshot.error &&
      snapshot.detail?.state === "draft" &&
      snapshot.recoveryMatches.ambiguous.length === 0
    ) {
      void loadSession(snapshot.detail.sessionId).catch(() => {});
    }
  });
}

/** Keeps timeline drops in the member's shell until Upload has read its batch. */
export function createUploadFileIntake(
  controller: Readonly<UploadSessionController>,
): UploadFileIntake {
  const state: IntakeState = {
    pendingFiles: [],
    activeRead: undefined,
    generation: 0,
    retainedSessionId: controller.getSnapshot().detail?.sessionId,
  };
  const loadSession = _makeLoadSessionFromIntake(controller, state);
  _resumeStagedDraftFiles(controller, state, loadSession);
  return {
    clear: (): void => {
      _clearIntakeState(state);
    },
    /** Retains original handles without putting them in history or storage. */
    stageFiles: (files: readonly File[]): void => {
      state.pendingFiles = state.pendingFiles.concat(files);
    },
    /** Reports files waiting for a read or an active transfer to finish. */
    getPendingFileCount: (): number => {
      return state.pendingFiles.length;
    },
    /** Reads first, consumes each staged drop once, and shares repeated reads. */
    loadSession,
  };
}
