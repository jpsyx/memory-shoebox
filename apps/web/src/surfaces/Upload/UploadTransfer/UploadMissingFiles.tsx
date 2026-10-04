import type { ReactNode } from "react";
import { UploadFileRow } from "./UploadFileRow";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import classes from "@/system/system.module.css";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  isRefusalsOnly?: boolean;
};
/** Every missing row is shown, with refusal and cancellation excluded from retry. */
export function UploadMissingFiles({
  snapshot,
  controller,
  isRefusalsOnly = false,
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
            isDisabled={snapshot.isBusy || snapshot.isRunning}
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
