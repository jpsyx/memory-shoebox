import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
import { UploadPrint } from "../UploadPrint/UploadPrint";
import classes from "./UploadDayPrints.module.css";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  files: readonly UploadFileDto[];
  canSelect: boolean;
  onRemove?: (fileId: string, trigger: HTMLElement) => void;
};

function _getLabelCountFromFile({
  snapshot,
  fileId,
}: Readonly<{ snapshot: UploadSnapshot; fileId: string }>): number {
  return (
    snapshot.detail?.edits.filter((edit) => {
      return (
        edit.undoneAt === null &&
        snapshot.editTargets.get(edit.editId)?.includes(fileId)
      );
    }).length ?? 0
  );
}

/** Renders the visible day files with saved labels and local previews. */
export function UploadDayPrints({
  snapshot,
  controller,
  previews,
  files,
  canSelect,
  onRemove,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.uploadDayPrintsDayBody}>
      {files.map((file) => {
        return (
          <UploadPrint
            key={file.fileId}
            file={file}
            localFile={snapshot.filesById.get(file.fileId)}
            activity={snapshot.fileActivityById.get(file.fileId)}
            previews={previews}
            selected={
              canSelect &&
              file.state !== "refused" &&
              file.state !== "cancelled"
                ? snapshot.selectedFileIds.has(file.fileId)
                : undefined
            }
            labelCount={_getLabelCountFromFile({
              snapshot: snapshot,
              fileId: file.fileId,
            })}
            onRemove={
              snapshot.detail?.state === "draft" && onRemove
                ? (trigger) => {
                    onRemove(file.fileId, trigger);
                  }
                : undefined
            }
            isRemoveDisabled={
              snapshot.isBusy ||
              snapshot.hasUnconfirmedRemoval ||
              snapshot.recoveryMatches.ambiguous.length > 0
            }
            onSelect={
              canSelect
                ? () => {
                    return controller.toggleFile(file.fileId);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
