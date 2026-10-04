import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { uploadOperationProblemCopy } from "../uploadCopyHelpers/uploadCopyHelpers";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onRetry: () => void;
};
/** Operation failures keep the plan and expose an explicit continuation. */
export function UploadSurfaceError({
  snapshot,
  controller,
  onRetry,
}: Readonly<Props>): ReactNode {
  if (!snapshot.error) {
    return null;
  }
  const canContinue = snapshot.error.operation === "declare";
  return (
    <div role="alert">
      <Prose>{uploadOperationProblemCopy(snapshot.error)}</Prose>
      {snapshot.isBusy ? null : (
        <Button
          variant="default"
          onClick={
            canContinue
              ? () => {
                  void controller.pickFiles([]).catch(() => {});
                }
              : onRetry
          }
        >
          {canContinue
            ? "Continue saving chosen files"
            : "Read this batch again"}
        </Button>
      )}
    </div>
  );
}
