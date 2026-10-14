import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadEdits } from "../../UploadDraft/UploadEdits";
import { UploadRecoveryChoices } from "../UploadRecoveryChoices/UploadRecoveryChoices";
import { UploadResumeActions } from "./UploadResumeActions";
import { UploadSavedVisibility } from "./UploadSavedVisibility";
import { isMissingUploadOriginal } from "../uploadResumeHelpers";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onPick: (files: readonly File[]) => void;
};
/**
 * Restored plans remain saved; re-picking sends only matching missing files.
 */
export function UploadResume({
  snapshot,
  controller,
  onPick,
}: Readonly<Props>): ReactNode {
  const detail = snapshot.detail!;
  const isUploading = detail.state === "uploading";
  const unavailableCount = detail.files.filter((file) => {
    return (
      isMissingUploadOriginal(
        file,
        snapshot.fileActivityById.get(file.fileId),
      ) && !snapshot.filesById.has(file.fileId)
    );
  }).length;
  return (
    <Stack gap="lg">
      <UploadEdits snapshot={snapshot} controller={controller} />
      <Sheet wide label="Picking up where this left off">
        <Stack gap="sm">
          <UploadSavedVisibility visibility={detail.visibility} />
          {unavailableCount > 0 ? (
            <Banner>
              {unavailableCount}{" "}
              {unavailableCount === 1 ? "original needs" : "originals need"} to
              be chosen again. You can choose the whole original selection or
              folder. Files already up are recognized by their contents and are
              not sent twice.
            </Banner>
          ) : null}
          <UploadRecoveryChoices snapshot={snapshot} controller={controller} />
          <UploadResumeActions
            snapshot={snapshot}
            controller={controller}
            onPick={onPick}
          />
          {isUploading ? (
            <Prose>
              Sending what arrived closes this batch. A batch notification can
              then be queued for the people who can see what arrived.
            </Prose>
          ) : null}
        </Stack>
      </Sheet>
    </Stack>
  );
}
