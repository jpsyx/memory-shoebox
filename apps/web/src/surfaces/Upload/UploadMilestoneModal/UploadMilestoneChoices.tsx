import type { MilestoneListResponse } from "@/api/milestoneHelpers/milestoneHelpers.types";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadMilestoneList } from "./UploadMilestoneList/UploadMilestoneList";
import { UploadMilestoneReview } from "./UploadMilestoneReview/UploadMilestoneReview";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  entries: MilestoneListResponse["milestones"];
  selectedFileCount: number;
  isLocked: boolean;
};
/** Existing occasions and explicit creation share one optional picker. */
export function UploadMilestoneChoices({
  form,
  entries,
  selectedFileCount,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <UploadMilestoneList
        entries={entries}
        chosenId={form.chosenId}
        isLocked={isLocked || !!form.created}
        onChoose={(chosenId) => {
          return form.patch({ chosenId });
        }}
      />
      {entries.length === 0 ? (
        <Prose>No milestones to choose yet.</Prose>
      ) : null}
      <UploadMilestoneReview form={form} isLocked={isLocked} />
      <Prose>
        One upload is not one milestone. Anything left without one simply sits
        on its own day.
      </Prose>
      <ChipRow>
        <Button
          disabled={
            isLocked ||
            !form.chosenId ||
            selectedFileCount === 0 ||
            (form.isUncertain && !form.isReviewed)
          }
          onClick={() => {
            void form.onAttach();
          }}
        >
          Attach {selectedFileCount}
        </Button>
      </ChipRow>
    </Stack>
  );
}
