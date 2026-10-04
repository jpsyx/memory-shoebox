import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { useUploadMilestoneForm } from "../useUploadMilestoneForm";
import { UploadMilestoneFields } from "./UploadMilestoneFields/UploadMilestoneFields";
import { UploadMilestoneFormActions } from "./UploadMilestoneFormActions";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  selectedFileCount: number;
  isLocked: boolean;
};
/** Persists an explicitly submitted occasion, then attaches the selection. */
export function UploadMilestoneForm({
  form,
  selectedFileCount,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!isLocked && !form.created) {
          void form.onCreate();
        }
      }}
    >
      <Stack gap="md">
        <UploadMilestoneFields form={form} isLocked={isLocked} />
        <Prose>
          It appears in the timeline on those dates as soon as you create it.
          These {selectedFileCount} are attached next. You can attach more
          later; cancelling the upload leaves the occasion in place.
        </Prose>
        <UploadMilestoneFormActions
          form={form}
          selectedFileCount={selectedFileCount}
          isLocked={isLocked}
        />
      </Stack>
    </form>
  );
}
