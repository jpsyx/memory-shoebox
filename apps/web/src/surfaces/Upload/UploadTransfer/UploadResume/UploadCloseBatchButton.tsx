import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";

/** Explicitly closes an armed batch while preserving everything already saved. */
export function UploadCloseBatchButton({
  snapshot,
  controller,
}: Readonly<{
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
}>): ReactNode {
  return snapshot.detail!.state === "uploading" ? (
    <Button
      variant="default"
      disabled={snapshot.isBusy && !snapshot.isRunning}
      onClick={() => {
        void controller.closeBatch().catch(() => {});
      }}
    >
      Send what did arrive
    </Button>
  ) : null;
}
