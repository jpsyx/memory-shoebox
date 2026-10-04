import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { MilestoneListResponse } from "@/api/milestones/milestones.types";
import { UploadMilestoneStatus } from "./UploadMilestoneStatus";
import { UploadMilestoneChoices } from "./UploadMilestoneChoices";
import { UploadMilestoneForm } from "./UploadMilestoneForm";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  entries: MilestoneListResponse["milestones"];
  count: number;
  isLocked: boolean;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
};
/** Composes loading, failure, list and creation within the same protected form. */
export function UploadMilestoneModalContent({
  form,
  entries,
  count,
  isLocked,
  isPending,
  isError,
  onRetry,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="md">
      <UploadMilestoneStatus
        isPending={isPending}
        isError={isError}
        error={form.error}
        isLocked={isLocked}
        onRetry={onRetry}
      />
      {form.isCreating && !form.isUncertain ? (
        <UploadMilestoneForm form={form} count={count} isLocked={isLocked} />
      ) : (
        <UploadMilestoneChoices
          form={form}
          entries={entries}
          count={count}
          isLocked={isLocked || isPending}
        />
      )}
    </Stack>
  );
}
