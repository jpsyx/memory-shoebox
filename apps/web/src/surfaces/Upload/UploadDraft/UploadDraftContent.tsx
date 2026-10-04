import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type {
  MemberRef,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type { UploadPreviewQueue } from "@/upload/uploadPreviewHelpers/uploadPreviewHelpers.types";
import { UploadRecoveryChoices } from "../UploadTransfer/UploadRecoveryChoices/UploadRecoveryChoices";
import { UploadMissingFiles } from "../UploadTransfer/UploadMissingFiles";
import { UploadFilePicker } from "../UploadSurface/UploadFilePicker";
import { UploadDraftOverview } from "./UploadDraftOverview";
import { UploadDraftDays } from "./UploadDraftDays";
import { UploadDraftFooter } from "./UploadDraftFooter";
import { UploadEdits } from "./UploadEdits";
import { UploadUndated } from "./UploadUndated";
import { UploadMilestonePrompts } from "./UploadMilestonePrompts";
import { UploadVisibility } from "../UploadVisibility/UploadVisibility";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  visibility: SetUploadVisibilityRequest;
  viewer: MemberRef;
  onVisibilityChange: (visibility: SetUploadVisibilityRequest) => void;
  onPick?: (files: readonly File[]) => void;
  onStart: () => void;
};
/** Saved edits, optional date fixes, day groups and batch visibility. */
export function UploadDraftContent({
  snapshot,
  controller,
  previews,
  visibility,
  viewer,
  onVisibilityChange,
  onStart,
  onPick,
}: Readonly<Props>): ReactNode {
  const needsHandles = snapshot.detail!.files.some((file) => {
    return file.state === "waiting" && !snapshot.filesById.has(file.fileId);
  });
  return (
    <Stack gap="lg">
      {needsHandles && onPick ? (
        <UploadFilePicker onPick={onPick} isDisabled={snapshot.isBusy} />
      ) : null}
      <UploadRecoveryChoices {...{ snapshot, controller }} />
      <UploadDraftOverview snapshot={snapshot} />
      <UploadMissingFiles {...{ snapshot, controller }} isRefusalsOnly />
      <UploadEdits snapshot={snapshot} controller={controller} />
      <UploadUndated snapshot={snapshot} controller={controller} />
      <UploadMilestonePrompts
        key={snapshot.detail!.sessionId}
        snapshot={snapshot}
        controller={controller}
      />
      <UploadDraftDays {...{ snapshot, controller, previews }} />
      <UploadVisibility
        choice={visibility}
        saved={snapshot.detail!.visibility}
        viewer={viewer}
        onChange={onVisibilityChange}
        isDisabled={snapshot.isBusy}
      />
      <UploadDraftFooter
        snapshot={snapshot}
        controller={controller}
        visibility={visibility}
        onStart={onStart}
      />
    </Stack>
  );
}
