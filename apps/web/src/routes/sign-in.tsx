import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Card } from "@/system/Chrome/Card";
import { Centred } from "@/system/Chrome/Centred";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

const searchSchema = z.object({
  /** Where to go once they are in. A link is an address, never a credential. */
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  component: SignInPage,
});

/**
 * Surface 1, the signed-out shell.
 *
 * A sibling of `_app` rather than a child, because a guard that redirected to
 * a guarded route is a loop. The card below is a placeholder: what belongs
 * inside is the email entry, the six-digit code, and the wrong, expired,
 * resent and unknown states, where `unknown` is byte identical to `sent`.
 */
function SignInPage() {
  return (
    <>
      <TopBar title="My Shoebox" detail="Sign in" />
      <Centred>
        <Card>
          <Lede>Sign in to My Shoebox.</Lede>
          <Prose>
            Surface 1 is built in step 4b, against the routes step 3a delivers.
          </Prose>
        </Card>
      </Centred>
    </>
  );
}
