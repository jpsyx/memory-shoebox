import type { ReactNode } from "react";
import type { SignInState } from "@/surfaces/SignIn/signInState.types";
import { Prose } from "@/system/typography/Prose";

type Props = {
  state: SignInState;
  /** The address as typed, which is the only thing this copy is sure of. */
  email: string;
};

/**
 * The paragraph under the lede.
 *
 * **The conditional wording is not hedging.** `POST /api/auth/sign-in-codes`
 * answers the same `202` whether or not the address belongs to a member, so
 * "We sent a six-digit code to abuela@example.com" is a claim this surface
 * cannot make and must never be able to make: it would turn the form into a
 * way of finding out who is in the family (`auth.md`).
 */
export function SignInBody({ state, email }: Readonly<Props>): ReactNode {
  if (state === "link") {
    return (
      <Prose>
        Sign in and it opens on the one you were sent. Only people in this
        Shoebox can see inside, so the link on its own will not do it.
      </Prose>
    );
  }
  if (state === "email") {
    return (
      <Prose>
        We will email you a six-digit code. There is no password to remember and
        nothing to install.
      </Prose>
    );
  }
  if (state === "resent") {
    return (
      <Prose>
        If <b>{email}</b> is in this Shoebox, a new code is on its way there
        now. The old one has stopped working. It usually arrives in about a
        minute.
      </Prose>
    );
  }
  return (
    <Prose>
      If <b>{email}</b> is in this Shoebox, a six-digit code is on its way there
      now. It arrives in about a minute and it works for ten.
    </Prose>
  );
}
