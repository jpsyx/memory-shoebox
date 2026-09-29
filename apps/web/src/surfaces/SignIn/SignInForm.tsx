import { Button, Stack } from "@mantine/core";
import type { FormEvent, ReactNode } from "react";
import { CodeField } from "@/surfaces/SignIn/CodeField";
import { EmailField } from "@/surfaces/SignIn/EmailField";
import { SignInFootnote } from "@/surfaces/SignIn/SignInFootnote";
import { Prose } from "@/system/typography/Prose";

/**
 * What the form draws and drives, named here rather than taken as the whole
 * flow: the form has no business with the state name the lede reads, and a
 * refusal arrives already sorted into the control it belongs under.
 */
type Props = {
  email: string;
  code: string;
  emailError: string | undefined;
  codeError: string | undefined;
  formError: string | undefined;
  wantsCode: boolean;
  isBusy: boolean;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
};

/**
 * The form: an address, six digits once they have been asked for, and one
 * button.
 *
 * One button, always, whichever state the surface is in. The two calls behind
 * it are the form's business rather than the reader's: somebody who has just
 * typed a code should not have to choose between sending and signing in.
 *
 * `noValidate` because the server is what judges an address (Decision 2, and
 * `EmailField`'s own note).
 */
export function SignInForm({
  email,
  code,
  emailError,
  codeError,
  formError,
  wantsCode,
  isBusy,
  onEmailChange,
  onCodeChange,
  onSubmit,
  onResend,
}: Readonly<Props>): ReactNode {
  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <Stack gap="md" mt="lg">
        <EmailField value={email} onChange={onEmailChange} error={emailError} />

        {wantsCode ? (
          <CodeField value={code} onChange={onCodeChange} error={codeError} />
        ) : null}

        {formError === undefined ? null : (
          // Announced, because it sits outside every field's own
          // `aria-describedby` and a rate limit is the one refusal somebody
          // can do nothing about except read it.
          <Prose role="alert">{formError}</Prose>
        )}

        <Button type="submit" loading={isBusy}>
          {wantsCode ? "Open the photos" : "Email me a code"}
        </Button>

        <SignInFootnote
          wantsCode={wantsCode}
          isBusy={isBusy}
          onResend={onResend}
        />
      </Stack>
    </form>
  );
}
