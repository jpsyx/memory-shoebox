import { Button, SegmentedControl, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { ArrangementPreview } from "@/surfaces/Settings/SettingsArrangement/ArrangementPreview/ArrangementPreview";
import { ArrangementExplanation } from "@/surfaces/Settings/SettingsArrangement/ArrangementExplanation";
import { useArrangementDraft } from "@/surfaces/Settings/SettingsArrangement/useArrangementDraft";
type Props = { arrangement: "tidy" | "messy" };

/** Choose the shared arrangement using a real miniature of the archive. */
export function SettingsArrangement({
  arrangement,
}: Readonly<Props>): ReactNode {
  const form = useArrangementDraft(arrangement);
  return (
    <Sheet wide label="How the timeline is arranged">
      <SheetHead title="How the timeline is arranged" />
      <Stack gap="md">
        <SegmentedControl
          value={form.draft}
          disabled={form.blocked}
          onChange={form.onChange}
          data={[
            { value: "tidy", label: "Tidy" },
            { value: "messy", label: "Messy" },
          ]}
          aria-label="Timeline arrangement"
        />
        <ArrangementPreview arrangement={form.draft} />
        <ArrangementExplanation />
        {form.isEdited ? (
          <Button
            disabled={form.blocked}
            loading={form.mutation.isPending}
            onClick={form.onSave}
          >
            Save arrangement
          </Button>
        ) : null}
        {form.mutation.error === null ? null : (
          <Prose role="alert">{form.mutation.error.message}</Prose>
        )}
        <SettingsSaveNotice field="arrangement" />
      </Stack>
    </Sheet>
  );
}
