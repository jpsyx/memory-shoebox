import type {
  UploadControllerContext,
  UploadSnapshot,
} from "./uploadSessionController.types";

/** A fresh browser snapshot contains no server session or transfer handles. */
export function makeIdleUploadSnapshot(): UploadSnapshot {
  return {
    phase: "idle",
    filesById: new Map(),
    selectedFileIds: new Set(),
    fileActivityById: new Map(),
    editTargets: new Map(),
    declaredCount: 0,
    declarationTotal: 0,
    checkingCount: 0,
    checkingTotal: 0,
    recoveryMatches: {
      knownMatches: [],
      ambiguous: [],
      alreadyUpClientRefs: [],
      refusedClientRefs: [],
      unmatchedClientRefs: [],
    },
    isBusy: false,
    isRunning: false,
  };
}

/** Releases batch resources while retaining subscriptions and operation lifetime. */
export function releaseUploadBatchLocally(
  options: Readonly<{ context: UploadControllerContext; isBusy?: boolean }>,
): void {
  const { context, isBusy = false } = options;
  context.state.engine?.cancel();
  context.state.engine = undefined;
  context.state.pendingPicks = [];
  context.state.needsDeclarationRead = false;
  context.publish({ ...makeIdleUploadSnapshot(), isBusy });
}
