import { ChipRow } from "@/system/Chip/ChipRow";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { useUploadMilestoneForm } from "../useUploadMilestoneForm";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  selectedFileCount: number;
  isLocked: boolean;
};
/** Creation is explicit; a saved occasion only offers attachment retry. */
export function UploadMilestoneFormActions({
  form,
  selectedFileCount,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {form.created ? (
        <Button
          disabled={isLocked || selectedFileCount === 0}
          loading={form.isSaving}
          onClick={() => {
            void form.onAttach();
          }}
        >
          Retry attachment
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={
            isLocked ||
            !form.canCreate ||
            form.isUncertain ||
            selectedFileCount === 0
          }
          loading={form.isSaving}
        >
          Create it and attach {selectedFileCount}
        </Button>
      )}
      {!form.created ? (
        <Button
          variant="default"
          disabled={isLocked}
          onClick={() => {
            return form.patch({ isCreating: false });
          }}
        >
          Back to the list
        </Button>
      ) : null}
    </ChipRow>
  );
}
