import { Anchor } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";

type Props = {
  /** Whether a code has been asked for, which is what changes the line. */
  wantsCode: boolean;
  /** Whether a call is in flight, which is what closes the resend. */
  isBusy: boolean;
  onResend: () => void;
};

/**
 * The line under the button.
 *
 * Before a code is asked for it says who may sign in at all, because there is
 * no sign-up path here and somebody who expected one needs telling. After
 * one, it says what to do when nothing arrived, and it names the junk folder:
 * that is where a machine's mail goes, and a person who does not look there
 * concludes the Shoebox is broken.
 *
 * "Send another" performs an action rather than going anywhere, so it is a
 * real `button` styled as an anchor, not an `a` with no destination. It
 * closes while a call is in flight, because a second mint supersedes the code
 * the first one's email is already carrying.
 */
export function SignInFootnote({
  wantsCode,
  isBusy,
  onResend,
}: Readonly<Props>): ReactNode {
  if (!wantsCode) {
    return (
      <Prose>
        Only people who have been invited can sign in. There is no way to make
        an account here.
      </Prose>
    );
  }
  return (
    <Prose>
      No code?{" "}
      <Anchor
        component="button"
        type="button"
        disabled={isBusy}
        onClick={onResend}
      >
        Send another
      </Anchor>
      . Check the junk folder too: it comes from a machine, and machines end up
      there.
    </Prose>
  );
}
