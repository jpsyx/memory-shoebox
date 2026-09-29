import { TextInput } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
};

/**
 * The code field.
 *
 * One wide field with tracked tabular figures rather than six separate boxes:
 * six boxes are fiddly to fill on a phone, they break paste, and they are the
 * sort of invented control this audience has to be taught.
 *
 * **The prototype's `maxLength={6}` is deliberately not carried across.** A
 * value pasted out of a mail client routinely arrives as "410 233", or with a
 * trailing space the client selected along with it, and `maxLength` truncates
 * that at the seventh character before anything can clean it up. Surviving a
 * paste is the reason this is one box rather than six, so the digits are
 * filtered and capped here instead, where the whitespace can be dropped first.
 */
export function CodeField({
  value,
  onChange,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <TextInput
      label="The six digits we just emailed you"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
      }}
      error={
        error === undefined ? undefined : (
          <>
            <IconAlertCircle {...ICON_PROPS} />
            {error}
          </>
        )
      }
      classNames={{ input: classes.codeField }}
    />
  );
}
