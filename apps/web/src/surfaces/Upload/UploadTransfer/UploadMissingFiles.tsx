import classes from "@/system/system.module.css";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { ReactNode } from "react";
import { UploadFileRow } from "./UploadFileRow/UploadFileRow";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  isRefusalsOnly?: boolean;
  onRemove?: (fileId: string, trigger: HTMLElement) => void;
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
}: Readonly<Props>): ReactNode {
  const missing = snapshot.detail!.files.filter((file) => {
    return isRefusalsOnly ? file.state === "refused" : file.state !== "done";
  });
  return (
    <div className={classes.fileList}>
      {missing.map((file) => {
        const canRetry =
          (file.state === "failed" ||
            file.state === "waiting" ||
            file.state === "sending") &&
          snapshot.filesById.has(file.fileId);
        return (
          <UploadFileRow
            key={file.fileId}
            file={file}
            activity={snapshot.fileActivityById.get(file.fileId)}
            isDisabled={
              snapshot.isBusy ||
              snapshot.isRunning ||
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
