import { Button, Stack, Switch } from "@mantine/core";
import { IconMail } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import {
  NOTIFY_ALL,
  NOTIFY_KINDS,
  NOTIFY_NONE,
} from "@/surfaces/Account/notifyKinds";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

/**
 * Props for the Email sheet: the four switches and nothing they do not need.
 *
 * `notify` is not local state: it is the server's own answer, kept in sync by
 * the assembly (Task 10), so a failed write shows the old position rather
 * than the one somebody just pressed.
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
        <Prose>
          Nothing here is ever one email per photograph. Turn off whatever you
          do not want and the rest keeps coming.
        </Prose>
        <Stack gap="sm">
          {NOTIFY_KINDS.map((kind) => {
            return (
              <div key={kind.key} className={classes.notifyRow}>
                <Switch
                  checked={notify[kind.key]}
                  disabled={isSaving}
                  onChange={(event) => {
                    onSave({
                      ...notify,
                      [kind.key]: event.currentTarget.checked,
                    });
                  }}
                  label={kind.label}
                />
                <span className={classes.notifyNote}>{kind.note}</span>
              </div>
            );
          })}
        </Stack>
        <ChipRow>
          <Button
            variant="default"
            size="sm"
            disabled={!someOn || isSaving}
            onClick={() => {
              onSave(NOTIFY_NONE);
            }}
          >
            Turn them all off
          </Button>
          {someOn ? null : (
            <Button
              variant="default"
              size="sm"
              disabled={isSaving}
              onClick={() => {
                onSave(NOTIFY_ALL);
              }}
            >
              Turn them back on
            </Button>
          )}
        </ChipRow>
        {error === undefined ? null : <Prose role="alert">{error}</Prose>}
        <Banner icon={<IconMail {...ICON_PROPS} />}>
          <b>Sign-in codes are not on this list.</b> Without them there is no
          way back in, so they arrive however many of these you switch off.
        </Banner>
      </Stack>
    </Sheet>
  );
}
