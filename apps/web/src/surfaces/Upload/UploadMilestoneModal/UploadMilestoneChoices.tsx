import { Button, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import type { MilestoneListResponse } from "@/api/milestones/milestones.types";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
import { UploadMilestoneList } from "./UploadMilestoneList";
import { UploadMilestoneReview } from "./UploadMilestoneReview";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  entries: MilestoneListResponse["milestones"];
  count: number;
  isLocked: boolean;
};
/** Existing occasions and explicit creation share one optional picker. */
export function UploadMilestoneChoices({
  form,
  entries,
  count,
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
            count === 0 ||
            (form.isUncertain && !form.isReviewed)
          }
          onClick={() => {
            void form.onAttach();
          }}
        >
          Attach {count}
        </Button>
      </ChipRow>
    </Stack>
  );
}
