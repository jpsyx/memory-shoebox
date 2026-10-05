import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { TimezoneDraft } from "@/surfaces/Settings/SettingsTimezone/useTimezoneDraft";
import { TimezoneImpact } from "@/surfaces/Settings/SettingsTimezone/TimezoneImpact/TimezoneImpact";
type Props = { form: TimezoneDraft };

/**
 * Preview is separate from deliberate confirmation of its exact candidate
 * zone.
 */
export function TimezoneControls({ form }: Readonly<Props>): ReactNode {
  const impact = form.previewResult?.timezoneImpact;
  return (
    <>
      {form.isEdited ? (
        <Button
          variant="default"
          disabled={form.blocked}
          loading={form.preview.isPending}
          onClick={form.onPreview}
        >
          Preview timezone change
        </Button>
      ) : null}
      {impact === null || impact === undefined ? null : (
        <>
          <TimezoneImpact impact={impact} isPreview />
          <Button
            disabled={form.blocked}
            loading={form.save.isPending}
            onClick={form.onConfirm}
          >
            Confirm timezone change
          </Button>
        </>
      )}
    </>
  );
}
