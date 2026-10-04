import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
import { UploadMilestoneFields } from "./UploadMilestoneFields";
import { UploadMilestoneFormActions } from "./UploadMilestoneFormActions";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  count: number;
  isLocked: boolean;
};
/** Persists an explicitly submitted occasion, then attaches the selection. */
export function UploadMilestoneForm({
  form,
  count,
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
          These {count} are attached next. You can attach more later; cancelling
          the upload leaves the occasion in place.
        </Prose>
        <UploadMilestoneFormActions
          form={form}
          count={count}
          isLocked={isLocked}
        />
      </Stack>
    </form>
  );
}
