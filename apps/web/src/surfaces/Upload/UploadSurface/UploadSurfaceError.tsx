import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { uploadOperationProblemCopy } from "../uploadCopyHelpers/uploadCopyHelpers";
type Props = {
  snapshot: UploadSnapshot;
  onRetry: () => void;
};
/** Operation failures keep the plan and expose an explicit continuation. */
export function UploadSurfaceError({
  snapshot,
  onRetry,
}: Readonly<Props>): ReactNode {
  if (!snapshot.error) {
    return null;
  }
  const canContinue = snapshot.error.operation === "declare";
  return (
    <div role="alert">
      <Prose onPanel>{uploadOperationProblemCopy(snapshot.error)}</Prose>
      {snapshot.isBusy ? null : (
        <Button mt="sm" variant="panel" onClick={onRetry}>
          {canContinue
            ? "Continue saving chosen files"
            : "Read this batch again"}
        </Button>
      )}
    </div>
  );
}
