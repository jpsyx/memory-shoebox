import type { MilestoneListResponse } from "@/api/milestoneHelpers/milestoneHelpers.types";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadMilestoneChoices } from "./UploadMilestoneChoices";
import { UploadMilestoneForm } from "./UploadMilestoneForm/UploadMilestoneForm";
import { UploadMilestoneStatus } from "./UploadMilestoneStatus";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  entries: MilestoneListResponse["milestones"];
  selectedFileCount: number;
  isLocked: boolean;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
};

/**
 * Composes loading, failure, list and creation within the same protected
 * form.
 */
export function UploadMilestoneModalContent({
  form,
  entries,
  selectedFileCount,
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
        <UploadMilestoneForm
          form={form}
          selectedFileCount={selectedFileCount}
          isLocked={isLocked}
        />
      ) : (
        <UploadMilestoneChoices
          form={form}
          entries={entries}
          selectedFileCount={selectedFileCount}
          isLocked={isLocked || isPending}
        />
      )}
    </Stack>
  );
}
