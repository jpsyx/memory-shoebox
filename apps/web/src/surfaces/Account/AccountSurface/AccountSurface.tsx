import { Stack } from "@mantine/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";
import { AccountDevices } from "@/surfaces/Account/AccountSurface/AccountDevices";
import {
  useSaveMe,
  useSaveNotify,
} from "@/surfaces/Account/AccountSurface/accountMutations";
import { AdminDoors } from "@/surfaces/Account/AdminDoors/AdminDoors";
import { EmailSheet } from "@/surfaces/Account/EmailSheet/EmailSheet";
import { LicenceSheet } from "@/surfaces/Account/LicenceSheet";
import { YouSheet } from "@/surfaces/Account/YouSheet/YouSheet";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";

/**
 * Surface 9: the name the family sees, the address codes go to, a switch per
 * kind of email, every device signed in as you, and, for an admin, the five
 * doors.
 *
 * **Every sheet below is stateless and takes what it draws as props**, which
 * is what lets each of them be tested without a router or a query client, and
 * what makes the optimistic switch write possible at all.
 *
 * Fetching lives here and in `AccountDevices`, and nowhere else in the
 * surface. The device list is the one thing that did not belong here: it is
 * the only part whose loading and failed states are drawn rather than
 * ignored, so it owns its own query instead of having five more props
 * threaded down to it from a component that never reads them.
 *
 * The three writes live in `accountMutations.ts` beside this file, because
 * they share a mutation scope whose reasoning belongs in one place. See that
 * file.
 *
 * `meQueryOptions` is already in the cache, put there by `_app`'s guard, so
 * the suspense read is a read rather than a second request.
 *
 * The reading-width `Page`, not the wide one: `design-spec.md` § Spacing and
 * layout names the five surfaces that get `.pageWide` (Upload, Members,
 * Groups, Milestones, Who has been looking) and My account is not among
 * them, which is why the prototype uses the narrow page too.
 */
export function AccountSurface(): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const { data: account } = useSuspenseQuery(meQueryOptions);
  const savingName = useSaveMe();
  const savingNotify = useSaveNotify();

  // Unreachable: the guard redirects when nobody is signed in, and the type
  // says otherwise only because a `401` is the one refusal that is an answer.
  if (account === null) {
    return null;
  }

  return (
    <>
      <TopBar back={{ label: "Back to the pile", to: "/" }} />
      <Page>
        <Stack gap="lg">
          <Lede>
            {account.me.member.displayName}, in {settings.shoeboxName}.
          </Lede>
          <YouSheet
            me={account.me}
            onSave={savingName.save}
            isSaving={savingName.isSaving}
            savedAt={savingName.savedAt}
            error={savingName.error}
          />
          <EmailSheet
            notify={account.me.notify}
            onSave={savingNotify.save}
            isSaving={savingNotify.isSaving}
            error={savingNotify.error}
          />
          <AccountDevices />
          {viewer.isAdmin ? <AdminDoors /> : null}
          <LicenceSheet />
        </Stack>
      </Page>
    </>
  );
}
