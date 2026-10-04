import { Radio, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import type { useUploadMilestoneFix } from "./useUploadMilestoneFix";
type Props = {
  group: UploadMismatchGroup;
  form: ReturnType<typeof useUploadMilestoneFix>;
  isLocked: boolean;
};
/** Moving the photographs remains the approved default reconciliation choice. */
export function UploadMilestoneFixApproach({
  group,
  form,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <Radio.Group
      value={form.approach}
      aria-label="What to change"
      onChange={(value) => {
        if (value === "photos" || value === "milestone") {
          form.patch({ approach: value });
        }
      }}
    >
      <Stack gap="sm">
        <Radio
          value="photos"
          disabled={isLocked || form.hasWidened}
          label="Move the photographs onto the occasion"
          description={
            form.isSpan
              ? "You say which of its days each one belongs to."
              : `All ${group.files.length} take the date ${dayLabel(group.milestone.startsOn)}.`
          }
        />
        <Radio
          value="milestone"
          disabled={isLocked}
          label="Widen the occasion to cover them"
          description="The milestone's dates stretch to include every date below."
        />
      </Stack>
    </Radio.Group>
  );
}
