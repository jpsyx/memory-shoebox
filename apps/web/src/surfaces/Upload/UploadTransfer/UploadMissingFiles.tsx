import classes from "@/system/system.module.css";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
import { UploadFileRow } from "./UploadFileRow/UploadFileRow";
import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import { isMissingUploadOriginal } from "./uploadResumeHelpers";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  isRefusalsOnly?: boolean;
  onRemove?: (fileId: string, trigger: HTMLElement) => void;
  previews?: UploadPreviewQueue;
};
/**
 * Every missing row is shown, with refusal and cancellation excluded from
 * retry.
 */
export function UploadMissingFiles({
  snapshot,
  controller,
  isRefusalsOnly = false,
  onRemove,
  previews,
}: Readonly<Props>): ReactNode {
  const missing = snapshot.detail!.files.filter((file) => {
    return isRefusalsOnly ? file.state === "refused" : file.state !== "done";
  });
  return (
    <div className={classes.fileList}>
      {missing.map((file) => {
        const canRetry =
          isMissingUploadOriginal(
            file,
            snapshot.fileActivityById.get(file.fileId),
          ) && snapshot.filesById.has(file.fileId);
        return (
          <UploadFileRow
            key={file.fileId}
            file={file}
            localFile={snapshot.filesById.get(file.fileId)}
            previews={previews}
            activity={snapshot.fileActivityById.get(file.fileId)}
            isComplete={snapshot.detail?.state === "settled"}
            isDisabled={
              snapshot.isBusy ||
              snapshot.isRunning ||
              snapshot.phase === "loading" ||
              snapshot.phase === "checking" ||
              snapshot.recoveryMatches.ambiguous.length > 0 ||
              Boolean(snapshot.hasUnconfirmedRemoval)
            }
            onRemove={
              onRemove &&
              snapshot.detail!.state === "draft" &&
              snapshot.recoveryMatches.ambiguous.length === 0
                ? (trigger) => {
                    onRemove(file.fileId, trigger);
                  }
                : undefined
            }
            onRetry={
              canRetry
                ? () => {
                    void controller
                      .retryMissingFiles([file.fileId])
                      .catch(() => {});
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
