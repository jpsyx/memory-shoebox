import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { NotifyPreferences } from "@memory-shoebox/shared";
import { NotifyRow } from "@/surfaces/Account/NotifyRow";
import { NOTIFY_KINDS } from "@/surfaces/Account/notifyKinds";

/** Saved preferences and the action for changing one category. */
type Props = {
  notify: NotifyPreferences;
  isSaving: boolean;
  focusCommentTag?: boolean;
  tagError?: string;
  onSave: (notify: NotifyPreferences) => void;
};

/**
 * The category controls, each write sending the whole `notify` with one
 * key changed. Lifted out of `EmailSheet` alongside `NotifyRow`, so the sheet
 * itself reads as its sections rather than as the loop that fills one of them.
 */
export function NotifySwitches({
  notify,
  isSaving,
  onSave,
  focusCommentTag,
  tagError,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="sm">
      {NOTIFY_KINDS.map((kind) => {
        return (
          <NotifyRow
            key={kind.key}
            shouldFocus={kind.key === "onCommentTag" && focusCommentTag}
            error={kind.key === "onCommentTag" ? tagError : undefined}
            kind={kind}
            value={notify[kind.key]}
            disabled={isSaving}
            onChange={(checked) => {
              onSave({ ...notify, [kind.key]: checked });
            }}
          />
        );
      })}
    </Stack>
  );
}
