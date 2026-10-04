import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  createUploadEditRequestSchema,
  UPLOAD_LIMITS,
  type CreateUploadEditRequest,
  type UploadBatchEditDto,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { amendUploadDates } from "./amendUploadDates";
import type {
  UploadControllerContext,
  UploadDraftLabel,
  UploadEditAttempt,
  UploadSessionController,
} from "./createUploadSessionController.types";
import { loadUploadSession } from "./uploadManifestReadHelpers";
import { writeUploadRecoveryHint } from "./uploadRecoveryStorageHelpers/uploadRecoveryStorageHelpers";

function _getDraftDetailFromContext(
  context: Readonly<UploadControllerContext>,
): UploadSessionDetail {
  const detail = context.state.snapshot.detail;
  if (!detail || detail.state !== "draft") {
    throw new Error("Only a draft batch can be edited.");
  }
  return detail;
}
function _getEditRequestsFromLabels(
  options: Readonly<{
    labels: readonly UploadDraftLabel[];
    targetFileIds: readonly string[];
  }>,
): CreateUploadEditRequest[] {
  const { labels, targetFileIds } = options;
  if (targetFileIds.length === 0) {
    throw new Error("Tick at least one file to add a label.");
  }
  if (
    targetFileIds.length > UPLOAD_LIMITS.editTargetsPerRequest &&
    labels.some((label) => {
      return label.kind === "person" && !label.personId;
    })
  ) {
    throw new Error(
      "A new person can be tagged on at most 1,000 files at once. Tick a smaller selection.",
    );
  }
  return labels.flatMap((label) => {
    return Array.from(
      {
        length: Math.ceil(
          targetFileIds.length / UPLOAD_LIMITS.editTargetsPerRequest,
        ),
      },
      (_, position) => {
        const start = position * UPLOAD_LIMITS.editTargetsPerRequest;
        return createUploadEditRequestSchema.parse({
          ...label,
          targetFileIds: targetFileIds.slice(
            start,
            start + UPLOAD_LIMITS.editTargetsPerRequest,
          ),
        });
      },
    );
  });
}
function _persistTargets(context: Readonly<UploadControllerContext>): void {
  const snapshot = context.state.snapshot;
  writeUploadRecoveryHint({
    ...context.dependencies,
    hint: {
      version: 1,
      sessionId: snapshot.detail!.sessionId,
      editTargets: Object.fromEntries(snapshot.editTargets),
    },
  });
}
function _recordSavedEdit(
  options: Readonly<{
    context: UploadControllerContext;
    edit: UploadBatchEditDto;
    targetFileIds?: readonly string[];
  }>,
): void {
  const { context, edit, targetFileIds } = options;
  const snapshot = context.state.snapshot;
  const editTargets = new Map(snapshot.editTargets);
  if (edit.undoneAt !== null) {
    editTargets.delete(edit.editId);
  } else if (targetFileIds) {
    editTargets.set(edit.editId, [...targetFileIds]);
  }
  const edits = snapshot.detail!.edits.filter((saved) => {
    return saved.editId !== edit.editId;
  });
  context.publish({
    ...snapshot,
    detail: { ...snapshot.detail!, edits: [...edits, edit] },
    editTargets,
  });
  _persistTargets(context);
}
type RefreshAfterUncertainWriteOptions = {
  context: UploadControllerContext;
  generation: number;
  sessionId: string;
  error: unknown;
};
async function _refreshAfterUncertainWrite(
  options: Readonly<RefreshAfterUncertainWriteOptions>,
): Promise<never> {
  const { context, generation, sessionId, error } = options;
  if (error instanceof ApiRequestError && error.status < 500) {
    throw error;
  }
  try {
    if (context.isCurrent(generation)) {
      await loadUploadSession({ context, generation, sessionId });
    }
  } catch {
    // Preserve successful local edits when the saved-plan read also fails.
  }
  throw new ApiRequestError({
    status: 0,
    code: "upload_edit_uncertain",
    message: `${error instanceof Error ? error.message : String(error)}. The answer was lost; review What you have added before trying again.`,
  });
}
type SendEditRequestsOptions = {
  context: UploadControllerContext;
  generation: number;
  sessionId: string;
  requests: readonly CreateUploadEditRequest[];
  onMilestoneConfirmed: () => void;
  onRequestConfirmed?: () => void;
  hasConfirmedMilestone?: boolean;
};
async function _sendEditRequests(
  options: Readonly<SendEditRequestsOptions>,
): Promise<void> {
  const { context, generation, sessionId, requests } = options;
  const request = requests[0];
  if (!request || !context.isCurrent(generation)) {
    return;
  }
  const edit = await (async () => {
    try {
      return await context.dependencies.api.createUploadEdit({
        sessionId,
        body: request,
      });
    } catch (error) {
      await _refreshAfterUncertainWrite({ ...options, error });
      return undefined;
    }
  })();
  if (!edit || !context.isCurrent(generation)) {
    return;
  }
  _recordSavedEdit({ context, edit, targetFileIds: request.targetFileIds });
  options.onRequestConfirmed?.();
  if (request.kind === "milestone") {
    options.onMilestoneConfirmed();
  }
  await _sendEditRequests({ ...options, requests: requests.slice(1) });
}
async function _sendEditsAndRefreshMilestones({
  hasConfirmedMilestone = false,
  ...options
}: Readonly<
  Omit<SendEditRequestsOptions, "onMilestoneConfirmed">
>): Promise<void> {
  const { context, generation, sessionId } = options;
  const refresh = async () => {
    if (context.isCurrent(generation)) {
      await loadUploadSession({ context, generation, sessionId });
    }
  };
  try {
    await _sendEditRequests({
      ...options,
      onMilestoneConfirmed: () => {
        hasConfirmedMilestone = true;
      },
    });
  } catch (error) {
    if (hasConfirmedMilestone) {
      // The original write error remains primary if the saved-plan read fails.
      await refresh().catch(() => {});
    }
    throw error;
  }
  if (hasConfirmedMilestone) {
    await refresh();
  }
}

type ApplyAttemptOptions = {
  context: UploadControllerContext;
  generation: number;
  attempt: UploadEditAttempt;
  progress: WeakMap<UploadEditAttempt, number>;
};
async function _applyEditAttempt({
  context,
  generation,
  attempt,
  progress,
}: Readonly<ApplyAttemptOptions>): Promise<void> {
  const detail = _getDraftDetailFromContext(context);
  if (detail.sessionId !== attempt.sessionId) {
    throw new Error("This action belongs to another upload batch.");
  }
  const requests = _getEditRequestsFromLabels(attempt);
  await _sendEditsAndRefreshMilestones({
    context,
    generation,
    sessionId: attempt.sessionId,
    requests: requests.slice(progress.get(attempt) ?? 0),
    hasConfirmedMilestone: requests
      .slice(0, progress.get(attempt) ?? 0)
      .some((request) => {
        return request.kind === "milestone";
      }),
    onRequestConfirmed: () => {
      progress.set(attempt, (progress.get(attempt) ?? 0) + 1);
    },
  });
  if (context.isCurrent(generation) && !attempt.preserveSelection) {
    const submitted = new Set(attempt.targetFileIds);
    context.publish({
      ...context.state.snapshot,
      selectedFileIds: new Set(
        [...context.state.snapshot.selectedFileIds].filter((fileId) => {
          return !submitted.has(fileId);
        }),
      ),
    });
  }
}

/**
 * Writes sequential validated edit chunks against a selection captured once.
 */
export async function applyUploadEdits(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    labels: readonly UploadDraftLabel[];
  }>,
): Promise<void> {
  const { context, generation, labels } = options;
  const detail = _getDraftDetailFromContext(context);
  const selected = context.state.snapshot.selectedFileIds;
  const targetFileIds = detail.files
    .filter((file) => {
      return file.state === "waiting" && selected.has(file.fileId);
    })
    .map((file) => {
      return file.fileId;
    });
  const requests = _getEditRequestsFromLabels({ labels, targetFileIds });
  await _sendEditsAndRefreshMilestones({
    context,
    generation,
    sessionId: detail.sessionId,
    requests,
  });
  if (context.isCurrent(generation)) {
    context.publish({ ...context.state.snapshot, selectedFileIds: new Set() });
  }
}

/**
 * Removes a reversible saved edit and its markers after server confirmation.
 */
export async function undoUploadEditPlan(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    editId: string;
  }>,
): Promise<void> {
  const { context, generation, editId } = options;
  const detail = _getDraftDetailFromContext(context);
  const edit = detail.edits.find((candidate) => {
    return candidate.editId === editId;
  });
  if (!edit?.canUndo || edit.undoneAt !== null) {
    throw new Error("This saved label cannot be undone.");
  }
  const saved = await (async () => {
    try {
      return await context.dependencies.api.undoUploadEdit({
        sessionId: detail.sessionId,
        editId,
      });
    } catch (error) {
      await _refreshAfterUncertainWrite({
        ...options,
        sessionId: detail.sessionId,
        error,
      });
      return undefined;
    }
  })();
  if (saved && context.isCurrent(generation)) {
    _recordSavedEdit({ context, edit: saved });
    if (edit.kind === "milestone") {
      await loadUploadSession({
        context,
        generation,
        sessionId: detail.sessionId,
      });
    }
  }
}

/** Adds only implemented bulk edit, Undo and calendar amendment actions. */
export function makeEditActionsFromContext(
  options: Readonly<{
    context: UploadControllerContext;
    run: ({
      operation,
      action,
    }: Readonly<{
      operation: string;
      action: (generation: number) => Promise<void>;
    }>) => Promise<void>;
  }>,
): Pick<
  UploadSessionController,
  "applyEdits" | "applyEditAttempt" | "undoEdit" | "amendDates"
> {
  const { context, run } = options;
  const progress = new WeakMap<UploadEditAttempt, number>();
  return {
    applyEditAttempt: (attempt) => {
      return run({
        operation: "edit",
        action: (generation) => {
          return _applyEditAttempt({ context, generation, attempt, progress });
        },
      });
    },
    applyEdits: (labels) => {
      return run({
        operation: "edit",
        action: (generation) => {
          return applyUploadEdits({ context, generation, labels });
        },
      });
    },
    undoEdit: (editId) => {
      return run({
        operation: "undo",
        action: (generation) => {
          return undoUploadEditPlan({ context, generation, editId });
        },
      });
    },
    amendDates: (choices) => {
      return run({
        operation: "date",
        action: (generation) => {
          return amendUploadDates({ context, generation, choices });
        },
      });
    },
  };
}
