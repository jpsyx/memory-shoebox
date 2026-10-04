import system from "@/system/system.module.css";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadFileDto } from "@memory-shoebox/shared";
import { clsx } from "clsx";
import { type ReactNode } from "react";
import classes from "../upload.module.css";
import { UploadPrint } from "./UploadPrint";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  files: readonly UploadFileDto[];
  canSelect: boolean;
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
}: Readonly<Props>): ReactNode {
  return (
    <div className={clsx(system.pile, system.uploadDayBody, classes.dayBody)}>
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
