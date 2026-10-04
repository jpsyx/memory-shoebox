import type { UploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue.types";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type {
  MemberRef,
  SetUploadVisibilityRequest,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { UploadFilePicker } from "../UploadSurface/UploadFilePicker/UploadFilePicker";
import { UploadMissingFiles } from "../UploadTransfer/UploadMissingFiles";
import { UploadRecoveryChoices } from "../UploadTransfer/UploadRecoveryChoices/UploadRecoveryChoices";
import { UploadVisibility } from "../UploadVisibility/UploadVisibility";
import { UploadDraftDays } from "./UploadDraftDays";
import { UploadDraftFooter } from "./UploadDraftFooter";
import { UploadDraftOverview } from "./UploadDraftOverview";
import { UploadEdits } from "./UploadEdits";
import { UploadMilestonePrompts } from "./UploadMilestonePrompts";
import { UploadUndated } from "./UploadUndated/UploadUndated";
type Props = {
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  previews: UploadPreviewQueue;
  visibility: SetUploadVisibilityRequest;
  viewer: MemberRef;
  onVisibilityChange: (
    visibility: Readonly<SetUploadVisibilityRequest>,
  ) => void;
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
