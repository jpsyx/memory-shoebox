import { NativeSelect, Switch } from "@mantine/core";
import { useEffect, useRef, type ReactNode } from "react";
import {
  notificationFrequencySchema,
  type NotificationFrequency,
} from "@memory-shoebox/shared";
import type { NotifyKind } from "@/surfaces/Account/notifyKinds";
import classes from "@/system/system.module.css";

type Props = Readonly<{
  kind: NotifyKind;
  value: boolean | NotificationFrequency;
  disabled: boolean;
  onChange: (value: boolean | NotificationFrequency) => void;
  shouldFocus?: boolean;
  error?: string;
}>;

function useControlFocus({ shouldFocus, disabled, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (shouldFocus) {
      (selectRef.current ?? inputRef.current)?.focus();
    }
  }, [shouldFocus]);
  useEffect(() => {
    if (!disabled && restoreFocus.current) {
      if (document.activeElement === document.body) {
        (selectRef.current ?? inputRef.current)?.focus();
      }
      restoreFocus.current = false;
    }
  }, [disabled]);
  const onValueChange = (updated: boolean | NotificationFrequency) => {
    restoreFocus.current = true;
    onChange(updated);
  };
  return { inputRef, selectRef, onValueChange };
}

function NotifyControl(props: Props): ReactNode {
  const { kind, value, disabled, error } = props;
  const { inputRef, selectRef, onValueChange } = useControlFocus(props);
  const describedBy = `${kind.key}-note${error ? ` ${kind.key}-error` : ""}`;
  if (typeof value === "boolean") {
    return (
      <Switch
        ref={inputRef}
        label={kind.label}
        checked={value}
        disabled={disabled}
        onChange={(event) => {
          onValueChange(event.currentTarget.checked);
        }}
        aria-describedby={describedBy}
      />
    );
  }
  return (
    <NativeSelect
      ref={selectRef}
      label={kind.label}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        onValueChange(
          notificationFrequencySchema.parse(event.currentTarget.value),
        );
      }}
      data={[
        { value: "off", label: "Off" },
        { value: "immediate", label: "Immediate" },
        { value: "daily", label: "Daily digest" },
      ]}
      aria-describedby={describedBy}
    />
  );
}

/** A frequency selector for activity, or the independent removal switch. */
export function NotifyRow(props: Props): ReactNode {
  const { kind, value, error } = props;
  return (
    <div className={classes.notifyRow} data-notify-kind={kind.key}>
      <NotifyControl {...props} />
      <span id={`${kind.key}-note`} className={classes.notifyNote}>
        {kind.note}
        {kind.key === "onCommentTag" && value === "off"
          ? " You may still receive emails about your uploads or conversations, depending on your other settings."
          : ""}
      </span>
      {error ? (
        <span
          id={`${kind.key}-error`}
          role="alert"
          className={classes.notifyNote}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
