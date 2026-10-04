import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import type { useUploadMilestoneFix } from "./useUploadMilestoneFix";
type Props = {
  form: ReturnType<typeof useUploadMilestoneFix>;
  count: number;
  isLocked: boolean;
  onDismiss: () => void;
};
/** A move requires complete day choices; leave is a browser-only dismissal. */
export function UploadMilestoneFixActions({
  form,
  count,
  isLocked,
  onDismiss,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      <Button
        disabled={isLocked || (form.approach === "photos" && !form.canMove)}
        loading={form.isSaving}
        onClick={() => {
          void form.onSubmit();
        }}
      >
        {form.approach === "photos"
          ? `Move the ${count}`
          : "Widen the occasion"}
      </Button>
      <Button variant="default" disabled={isLocked} onClick={onDismiss}>
        Leave them as they are
      </Button>
    </ChipRow>
  );
}
