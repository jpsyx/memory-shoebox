import { Switch } from "@mantine/core";
import { useEffect, useRef, type ReactNode } from "react";
import type { NotifyKind } from "@/surfaces/Account/notifyKinds";
import classes from "@/system/system.module.css";

/** Props for one switch row: which kind, its position, and its callback. */
type Props = {
  kind: NotifyKind;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  shouldFocus?: boolean;
  error?: string;
};

/**
 * One switch, and the sentence that says what turning it off stops.
 *
 * Lifted out of `EmailSheet` because the switch and its note are already a
 * self-contained block; this is the whole of what repeats five times.
 */
export function NotifyRow({
  kind,
  checked,
  disabled,
  onChange,
  shouldFocus,
  error,
}: Readonly<Props>): ReactNode {
  const { inputRef, onSaveStart } = useNotifyRowFocus(disabled, shouldFocus);
  return (
    <div className={classes.notifyRow} data-notify-kind={kind.key}>
      <Switch
        ref={inputRef}
        aria-describedby={`${kind.key}-note${error ? ` ${kind.key}-error` : ""}`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onSaveStart();
          onChange(event.currentTarget.checked);
        }}
        label={kind.label}
      />
      <span id={`${kind.key}-note`} className={classes.notifyNote}>
        {kind.note}
        {kind.key === "onCommentTag" && !checked
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

function useNotifyRowFocus(isSaving: boolean, shouldFocus?: boolean) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSavedFocus = useRef(false);
  useEffect(() => {
    if (shouldFocus) {
      inputRef.current?.focus();
    }
  }, [shouldFocus]);
  useEffect(() => {
    if (!isSaving && hasSavedFocus.current) {
      // Native disabling blurs the switch. Respect focus moved elsewhere.
      if (document.activeElement === document.body) {
        inputRef.current?.focus();
      }
      hasSavedFocus.current = false;
    }
  }, [isSaving]);
  return {
    inputRef,
    onSaveStart: () => {
      hasSavedFocus.current = document.activeElement === inputRef.current;
    },
  };
}
