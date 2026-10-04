import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import type { useUploadMilestoneForm } from "./useUploadMilestoneForm";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  count: number;
  isLocked: boolean;
};
/** Creation is explicit; a saved occasion only offers attachment retry. */
export function UploadMilestoneFormActions({
  form,
  count,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      {form.created ? (
        <Button
          disabled={isLocked || count === 0}
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
            isLocked || !form.canCreate || form.isUncertain || count === 0
          }
          loading={form.isSaving}
        >
          Create it and attach {count}
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
