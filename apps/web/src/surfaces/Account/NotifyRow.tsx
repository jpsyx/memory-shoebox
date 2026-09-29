import { Switch } from "@mantine/core";
import type { ReactNode } from "react";
import type { NotifyKind } from "@/surfaces/Account/notifyKinds";
import classes from "@/system/system.module.css";

/** Props for one switch row: which kind, its position, and its callback. */
type Props = {
  kind: NotifyKind;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * One switch, and the sentence that says what turning it off stops.
 *
 * Lifted out of `EmailSheet` because the switch and its note are already a
 * self-contained block; this is the whole of what repeats four times.
 */
export function NotifyRow({
  kind,
  checked,
  disabled,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.notifyRow}>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
        label={kind.label}
      />
      <span className={classes.notifyNote}>{kind.note}</span>
    </div>
  );
}
