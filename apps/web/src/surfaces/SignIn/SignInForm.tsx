import { Button, Stack } from "@mantine/core";
import type { FormEvent, ReactNode } from "react";
import { CodeField } from "@/surfaces/SignIn/CodeField";
import { EmailField } from "@/surfaces/SignIn/EmailField";
import { SignInFootnote } from "@/surfaces/SignIn/SignInFootnote";
import type { SignInFlow } from "@/surfaces/SignIn/useSignInFlow";
import { Prose } from "@/system/typography/Prose";

type Props = {
  flow: SignInFlow;
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
export function SignInForm({ flow }: Readonly<Props>): ReactNode {
  const { failure, wantsCode } = flow;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    flow.onSubmit();
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="md" mt="lg">
        <EmailField
          value={flow.email}
          onChange={flow.setEmail}
          error={failure?.field === "email" ? failure.message : undefined}
        />

        {wantsCode ? (
          <CodeField
            value={flow.code}
            onChange={flow.setCode}
            error={failure?.field === "code" ? failure.message : undefined}
          />
        ) : null}

        {failure?.field === "form" ? (
          // Announced, because it sits outside every field's own
          // `aria-describedby` and a rate limit is the one refusal somebody
          // can do nothing about except read it.
          <Prose role="alert">{failure.message}</Prose>
        ) : null}

        <Button type="submit" loading={flow.isBusy}>
          {wantsCode ? "Open the photos" : "Email me a code"}
        </Button>

        <SignInFootnote wantsCode={wantsCode} onResend={flow.onResend} />
      </Stack>
    </form>
  );
}
