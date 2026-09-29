import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { publicSettingsQueryOptions } from "@/api/publicSettings/publicSettings";
import { SignInBody } from "@/surfaces/SignIn/SignInBody";
import { signInLede } from "@/surfaces/SignIn/signInCopy/signInCopy";
import { SignInForm } from "@/surfaces/SignIn/SignInForm";
import { useSignInFlow } from "@/surfaces/SignIn/useSignInFlow";
import { Card } from "@/system/Chrome/Card";
import { Centred } from "@/system/Chrome/Centred";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";

/**
 * What the bar says before the anonymous settings read has landed.
 *
 * A fallback rather than a spinner, deliberately: somebody who cannot see the
 * instance's name can still sign in, and somebody staring at a spinner cannot.
 */
const UNNAMED_SHOEBOX = "Shoebox";

/**
 * Surface 1, live.
 *
 * First contact for the least technical person in the Shoebox, and the only
 * surface where failure means no access at all. The state machine behind it
 * is `useSignInFlow`, which opens from the URL rather than from component
 * state: a reload mid-flow would otherwise lose the address, and the retyped
 * address mints a fresh code that stops the one already in the inbox from
 * working.
 *
 * The name comes from `GET /api/public-settings`, the one route an anonymous
 * caller may reach, because nobody is signed in here to read it from `/me`.
 */
export function SignInCard(): ReactNode {
  const flow = useSignInFlow();
  const { data: publicSettings } = useQuery(publicSettingsQueryOptions);
  const shoeboxName = publicSettings?.shoeboxName ?? UNNAMED_SHOEBOX;

  return (
    <>
      <TopBar title={shoeboxName} detail="Sign in" />
      <Centred>
        <Card>
          <Stack gap="sm">
            <Lede>{signInLede({ state: flow.state, shoeboxName })}</Lede>
            <SignInBody state={flow.state} email={flow.email} />
          </Stack>

          <SignInForm flow={flow} />
        </Card>
      </Centred>
    </>
  );
}
