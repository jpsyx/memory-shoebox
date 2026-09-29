import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
};

/**
 * The address field.
 *
 * **Nothing here judges what is typed** (Decision 2). `type="email"` is what
 * a phone reads to put the `@` on the keyboard, not a gate: the only verdict
 * on an address is the server's, and it comes back as
 * `400 invalid_request` and the sentence `signInCopy.ts` writes for it. The
 * form carries `noValidate` for the same reason, because an
 * `<input type="email">` inside a form is otherwise refused by the browser on
 * submit, in the browser's own wording, with the call never going out at all.
 */
export function EmailField({
  value,
  onChange,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <TextInput
      label="Your email"
      type="email"
      autoComplete="email"
      inputMode="email"
      placeholder="you@example.com"
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
      error={error}
    />
  );
}
