import { Stack } from "@mantine/core";
import { IconMail } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { NotifyBulkButtons } from "@/surfaces/Account/NotifyBulkButtons";
import { NotifySwitches } from "@/surfaces/Account/NotifySwitches";
import { NOTIFY_ALL, NOTIFY_NONE } from "@/surfaces/Account/notifyKinds";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";

/**
 * Props for the Email sheet: the four switches and nothing they do not need.
 *
 * `notify` is not local state: it is the server's own answer, and this
 * component is deliberately stateless, `checked` is read straight off
 * `notify` on every render, with nothing held in between.
 *
 * **The caller must update the cache optimistically, the instant a switch is
 * flipped, and roll it back on error.** This component cannot do that itself:
 * it has nothing to optimistically update, only `notify`, which it does not
 * own. Decision 4's rule that a switch must never look flipped while unsaved
 * is about refusing a separate Save button for switches, not about a lag on
 * every toggle: flipping the switch is the action, so it has to move the
 * instant it is flipped, and only the caller, which owns the mutation and the
 * query cache, can make that true.
 */
type Props = {
  notify: NotifyPreferences;
  onSave: (notify: NotifyPreferences) => void;
  isSaving: boolean;
  error: string | undefined;
};

/**
 * A switch per kind of email, each writing the moment it is flipped.
 *
 * There is no fifth, bulk switch: "Turn them all off" and "Turn them back on"
 * are each one save of the same four booleans as any single flip.
 */
export function EmailSheet({
  notify,
  onSave,
  isSaving,
  error,
}: Readonly<Props>): ReactNode {
  const someOn = Object.values(notify).some((on) => {
    return on;
  });

  return (
    <Sheet wide label="Email">
      <SheetHead title="Email" />
      <Stack gap="md">
        <NotifySwitches notify={notify} isSaving={isSaving} onSave={onSave} />
        <NotifyBulkButtons
          someOn={someOn}
          isSaving={isSaving}
          onTurnOff={() => {
            onSave(NOTIFY_NONE);
          }}
          onTurnOn={() => {
            onSave(NOTIFY_ALL);
          }}
        />
        {error === undefined ? null : <Prose role="alert">{error}</Prose>}
        <Banner icon={<IconMail {...ICON_PROPS} />}>
          <b>Sign-in codes are not on this list.</b> They still arrive when
          notifications are switched off.
        </Banner>
      </Stack>
    </Sheet>
  );
}
