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
  return (
    <Stack gap="lg">
      <UploadEdits snapshot={snapshot} controller={controller} />
      <Sheet wide label="Picking up where this left off">
        <Stack gap="sm">
          <UploadSavedVisibility visibility={detail.visibility} />
          <Banner>
            Pick the whole folder again if that is easier. Files that are
            already up are recognized by their contents and are not sent twice.
          </Banner>
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
