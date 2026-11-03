import { NotifyBulkButtons } from "@/surfaces/Account/NotifyBulkButtons";
import { NotifySwitches } from "@/surfaces/Account/NotifySwitches";
import { NOTIFY_ALL, NOTIFY_NONE } from "@/surfaces/Account/notifyKinds";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { IconMail } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

/**
 * Email preferences read directly from the caller's optimistic account cache.
 * Saves are immediate and roll back on failure; local state locates that error.
 */
type Props = {
  timezone?: string;
  notify: NotifyPreferences;
  onSave: (notify: NotifyPreferences) => void;
  isSaving: boolean;
  error: string | undefined;
  focusCommentTag?: boolean;
};

function DigestScheduleNote({
  timezone,
}: Readonly<{ timezone: string }>): ReactNode {
  return (
    <Prose>
      Daily digests arrive around 9 a.m. ({timezone}). Empty days send no email.
      Immediate emails are queued as activity happens. Changing frequency
      applies to new activity; leaving Daily discards pending digest activity.
    </Prose>
  );
}

/** Frequency controls save immediately; bulk actions use the same preferences. */
export function EmailSheet({
  timezone = "UTC",
  notify,
  onSave,
  isSaving,
  error,
  focusCommentTag,
}: Readonly<Props>): ReactNode {
  const [wasTagChanged, setWasTagChanged] = useState(false);
  const tagError =
    wasTagChanged && error
      ? "Couldn't change that email preference. Try again."
      : undefined;
  const someOn = Object.values(notify).some((value) => {
    return value !== false && value !== "off";
  });

  return (
    <Sheet wide label="Email">
      <SheetHead title="Email" />
      <Stack gap="md">
        <DigestScheduleNote timezone={timezone} />
        <NotifySwitches
          notify={notify}
          isSaving={isSaving}
          focusCommentTag={focusCommentTag}
          tagError={tagError}
          onSave={(updated) => {
            setWasTagChanged(updated.onCommentTag !== notify.onCommentTag);
            onSave(updated);
          }}
        />
        <NotifyBulkButtons
          someOn={someOn}
          isSaving={isSaving}
          onTurnOff={() => {
            setWasTagChanged(false);
            onSave(NOTIFY_NONE);
          }}
          onTurnOn={() => {
            setWasTagChanged(false);
            onSave(NOTIFY_ALL);
          }}
        />
        {error === undefined || tagError ? null : (
          <Prose role="alert">{error}</Prose>
        )}
        <Banner icon=<IconMail {...ICON_PROPS} />>
          <b>Sign-in codes are not on this list.</b> They still arrive when
          notifications are switched off.
        </Banner>
      </Stack>
    </Sheet>
  );
}
