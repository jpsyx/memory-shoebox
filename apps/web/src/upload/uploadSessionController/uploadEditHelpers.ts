import {
  createUploadEditRequestSchema,
  calendarDateSchema,
  UPLOAD_LIMITS,
  type CreateUploadEditRequest,
  type ManifestEntry,
  type UploadBatchEditDto,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { loadUploadSession } from "./uploadDeclarationHelpers";
import { writeUploadRecoveryHint } from "./uploadRecoveryStorage/uploadRecoveryStorage";
import type {
  UploadControllerContext,
  UploadDateChoice,
  UploadDraftLabel,
  UploadSessionController,
} from "./uploadSessionController.types";

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
};
async function _sendEditRequests(
  options: Readonly<SendEditRequestsOptions>,
): Promise<void> {
  const { context, generation, sessionId, requests } = options;
  const request = requests[0];
  if (!request || !context.isCurrent(generation)) {
    return;
  }
  let edit: UploadBatchEditDto;
  try {
    edit = await context.dependencies.api.createUploadEdit({
      sessionId,
      body: request,
    });
  } catch (error) {
    await _refreshAfterUncertainWrite({ ...options, error });
    return;
  }
  if (!context.isCurrent(generation)) {
    return;
  }
  _recordSavedEdit({ context, edit, targetFileIds: request.targetFileIds });
  if (request.kind === "milestone") {
    options.onMilestoneConfirmed();
  }
  await _sendEditRequests({ ...options, requests: requests.slice(1) });
}
async function _sendEditsAndRefreshMilestones(
  options: Readonly<Omit<SendEditRequestsOptions, "onMilestoneConfirmed">>,
): Promise<void> {
  const { context, generation, sessionId } = options;
  let hasConfirmedMilestone = false;
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
/** Writes sequential validated edit chunks against a selection captured once. */
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
/** Removes a reversible saved edit and its markers after server confirmation. */
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
  let saved: UploadBatchEditDto;
  try {
    saved = await context.dependencies.api.undoUploadEdit({
      sessionId: detail.sessionId,
      editId,
    });
  } catch (error) {
    await _refreshAfterUncertainWrite({
      ...options,
      sessionId: detail.sessionId,
      error,
    });
    return;
  }
  if (context.isCurrent(generation)) {
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
function _getManifestEntriesFromDateChoices(
  options: Readonly<{
    detail: UploadSessionDetail;
    choices: readonly UploadDateChoice[];
  }>,
): ManifestEntry[] {
  return options.choices.map((choice) => {
    const capturedOn = calendarDateSchema.parse(choice.capturedOn);
    const row = options.detail.files.find((file) => {
      return file.fileId === choice.fileId;
    });
    if (!row || row.state !== "waiting") {
      throw new Error(
        "Only a known waiting draft file can have its date corrected.",
      );
    }
    return {
      clientRef: row.fileId,
      fileId: row.fileId,
      originalFilename: row.originalFilename,
      declaredContentType: row.declaredContentType,
      declaredBytes: row.declaredBytes,
      contentHash: row.contentHash,
      capturedAt: `${capturedOn}T00:00:00.000Z`,
    };
  });
}
type SendDateChunksOptions = {
  context: UploadControllerContext;
  generation: number;
  sessionId: string;
  entries: readonly ManifestEntry[];
};
async function _sendDateChunks(
  options: Readonly<SendDateChunksOptions>,
): Promise<void> {
  const { context, generation, sessionId, entries } = options;
  if (!context.isCurrent(generation) || entries.length === 0) {
    return;
  }
  await context.dependencies.api.putUploadManifest({
    sessionId,
    files: entries.slice(0, UPLOAD_LIMITS.manifestEntriesPerRequest),
  });
  if (context.isCurrent(generation)) {
    await loadUploadSession({ context, generation, sessionId });
    await _sendDateChunks({
      ...options,
      entries: entries.slice(UPLOAD_LIMITS.manifestEntriesPerRequest),
    });
  }
}
/** Sends calendar dates from known DTO rows; clock preservation is server-owned. */
export async function amendUploadDates(
  options: Readonly<{
    context: UploadControllerContext;
    generation: number;
    choices: readonly UploadDateChoice[];
  }>,
): Promise<void> {
  const { context, generation, choices } = options;
  const detail = _getDraftDetailFromContext(context);
  const entries = _getManifestEntriesFromDateChoices({ detail, choices });
  await _sendDateChunks({
    context,
    generation,
    sessionId: detail.sessionId,
    entries,
  });
}

/** Adds only implemented bulk edit, Undo and calendar amendment actions. */
export function makeEditActionsFromContext(
  options: Readonly<{
    context: UploadControllerContext;
    run: (
      operation: string,
      action: (generation: number) => Promise<void>,
    ) => Promise<void>;
  }>,
): Pick<UploadSessionController, "applyEdits" | "undoEdit" | "amendDates"> {
  const { context, run } = options;
  return {
    applyEdits: (labels) => {
      return run("edit", (generation) => {
        return applyUploadEdits({ context, generation, labels });
      });
    },
    undoEdit: (editId) => {
      return run("undo", (generation) => {
        return undoUploadEditPlan({ context, generation, editId });
      });
    },
    amendDates: (choices) => {
      return run("date", (generation) => {
        return amendUploadDates({ context, generation, choices });
      });
    },
  };
}
