import { Sheet } from "@/system/Chrome/Sheet";
import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Stack } from "@mantine/core";
import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { UploadMilestoneFixActions } from "./UploadMilestoneFixActions";
import { UploadMilestoneFixChoices } from "./UploadMilestoneFixChoices";
import { useUploadMilestoneFix } from "./useUploadMilestoneFix";

type Props = {
  group: UploadMismatchGroup;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onDismiss: () => void;
};
/** Reconciles an upload's manifest rows before they become landed items. */
export function UploadMilestoneFix({
  group,
  snapshot,
  controller,
  onDismiss,
}: Readonly<Props>): ReactNode {
  const form = useUploadMilestoneFix({
    group,
    snapshot,
    controller,
    onDismiss,
  });
  const isLocked = form.isSaving || snapshot.isBusy;
  return (
    <Sheet wide label="Photographs outside the milestone">
      <Stack gap="md">
        <LabelText component="h2">
          {group.files.length} sit outside {group.milestone.name}
        </LabelText>
        <Prose>The occasion runs {milestoneDatesLabel(group.milestone)}.</Prose>
        <UploadMilestoneFixChoices
          group={group}
          form={form}
          isLocked={isLocked}
        />
        {form.error ? (
          <div role="alert">
            <Prose>{form.error}</Prose>
          </div>
        ) : null}
        <UploadMilestoneFixActions
          form={form}
          mismatchFileCount={group.files.length}
          isLocked={isLocked}
          onDismiss={onDismiss}
        />
        <Prose>
          Leaving them as they are keeps their capture dates and occasion. This
          prompt may appear again when you reopen the upload.
        </Prose>
      </Stack>
    </Sheet>
  );
}
