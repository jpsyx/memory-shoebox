import type {
  UploadControllerContext,
  UploadSessionController,
} from "./uploadSessionController.types";

/** Builds local edit selection actions over every loaded waiting draft row. */
export function makeSelectionActionsFromContext(
  context: Readonly<UploadControllerContext>,
): Pick<
  UploadSessionController,
  "toggleFile" | "selectDay" | "selectAll" | "clearSelection"
> {
  return {
    toggleFile: (fileId) => {
      if (
        !_canSelect(context) ||
        !context.state.snapshot.detail?.files.some((file) => {
          return file.fileId === fileId && file.state === "waiting";
        })
      ) {
        return;
      }
      const selectedFileIds = new Set(context.state.snapshot.selectedFileIds);
      if (selectedFileIds.has(fileId)) {
        selectedFileIds.delete(fileId);
      } else {
        selectedFileIds.add(fileId);
      }
      _publishSelection({ context, selectedFileIds });
    },
    selectDay: (capturedOn) => {
      _selectWaitingFiles({ context, capturedOn });
    },
    selectAll: () => {
      _selectWaitingFiles({ context });
    },
    clearSelection: () => {
      if (_canSelect(context)) {
        _publishSelection({ context, selectedFileIds: new Set() });
      }
    },
  };
}

function _selectWaitingFiles(
  options: Readonly<{ context: UploadControllerContext; capturedOn?: string }>,
): void {
  const { context, capturedOn } = options;
  const snapshot = context.state.snapshot;
  if (!_canSelect(context)) {
    return;
  }
  const selectedFileIds = new Set(snapshot.selectedFileIds);
  snapshot.detail?.files.forEach((file) => {
    if (
      file.state === "waiting" &&
      (capturedOn === undefined || file.capturedOn === capturedOn)
    ) {
      selectedFileIds.add(file.fileId);
    }
  });
  _publishSelection({ context, selectedFileIds });
}

function _canSelect(context: Readonly<UploadControllerContext>): boolean {
  return (
    !context.state.isDestroyed &&
    !context.state.snapshot.isBusy &&
    context.state.snapshot.detail?.state === "draft"
  );
}

function _publishSelection(
  options: Readonly<{
    context: UploadControllerContext;
    selectedFileIds: Set<string>;
  }>,
): void {
  const { context, selectedFileIds } = options;
  const previousSelection = context.state.snapshot.selectedFileIds;
  if (
    selectedFileIds.size === previousSelection.size &&
    [...selectedFileIds].every((fileId) => {
      return previousSelection.has(fileId);
    })
  ) {
    return;
  }
  context.publish({ ...context.state.snapshot, selectedFileIds });
}
