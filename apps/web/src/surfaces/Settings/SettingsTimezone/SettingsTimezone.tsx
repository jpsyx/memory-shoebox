import { NativeSelect, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { useTimezoneDraft } from "@/surfaces/Settings/SettingsTimezone/useTimezoneDraft";
import { makeTimezoneOptionsFromCurrentZone } from "@/surfaces/Settings/SettingsTimezone/makeTimezoneOptionsFromCurrentZone";
import { TimezoneImpact } from "@/surfaces/Settings/SettingsTimezone/TimezoneImpact/TimezoneImpact";
import { useSettingsSnapshot } from "@/surfaces/Settings/useSettingsSnapshot";
import { SettingsSaveNotice } from "@/surfaces/Settings/SettingsSaveNotice";
import { TimezoneExplanation } from "@/surfaces/Settings/SettingsTimezone/TimezoneExplanation";
import { TimezoneControls } from "@/surfaces/Settings/SettingsTimezone/TimezoneControls";
type Props = { timezone: string };

/**
 * One clock for offset-less media with preview, confirmation and committed
 * consequences.
 */
export function SettingsTimezone({ timezone }: Readonly<Props>): ReactNode {
  const form = useTimezoneDraft(timezone);
  const snapshot = useSettingsSnapshot();
  const savedImpact =
    snapshot.field === "timezone"
      ? (snapshot.result?.timezoneImpact ?? undefined)
      : undefined;
  return (
    <Sheet wide label="What time it is here">
      <SheetHead title="What time it is here" />
      <Stack gap="md">
        <NativeSelect
          label="This Shoebox's timezone"
          description="The saved timezone for the whole archive."
          data={makeTimezoneOptionsFromCurrentZone(timezone)}
          value={form.draft}
          disabled={form.blocked}
          error={form.preview.error?.message ?? form.save.error?.message}
          onChange={(event) => {
            form.onChange(event.currentTarget.value);
          }}
        />
        <TimezoneExplanation />
        <TimezoneControls form={form} />
        <SettingsSaveNotice field="timezone" />
        {savedImpact === undefined ? null : (
          <TimezoneImpact impact={savedImpact} isPreview={false} />
        )}
      </Stack>
    </Sheet>
  );
}
