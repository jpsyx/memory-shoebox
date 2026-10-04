import { ChipRow } from "@/system/Chip/ChipRow";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadFilePicker } from "../../UploadSurface/UploadFilePicker/UploadFilePicker";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onPick: (files: readonly File[]) => void;
};
/** Re-pick explicitly; closing the server batch is only for uploading state. */
export function UploadResumeActions({
  snapshot,
  controller,
  onPick,
}: Readonly<Props>): ReactNode {
  const hasMissing = snapshot.detail!.files.some((file) => {
    return (
      file.state === "waiting" ||
      file.state === "sending" ||
      file.state === "failed"
    );
  });
  return (
    <ChipRow>
      {hasMissing && !snapshot.isRunning ? (
        <UploadFilePicker onPick={onPick} isDisabled={snapshot.isBusy} />
      ) : null}
      {snapshot.detail!.state === "uploading" ? (
        <Button
          variant="default"
          disabled={snapshot.isBusy && !snapshot.isRunning}
          onClick={() => {
            void controller.closeBatch().catch(() => {});
          }}
        >
          Send what did arrive
        </Button>
      ) : null}
    </ChipRow>
  );
}
