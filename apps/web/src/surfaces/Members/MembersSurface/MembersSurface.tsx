import { useQuery } from "@tanstack/react-query";
import { meQueryOptions } from "@/api/me/me";
import { Stack } from "@mantine/core";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MembersDirectory } from "@/surfaces/Members/MembersSurface/MembersDirectory";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";

/**
 * Surface 12: the admin's member directory, invitations and signed-in devices.
 */
export function MembersSurface(): ReactNode {
  const { viewer } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  const isAdmin = viewer.isAdmin && account.data?.me.role === "admin";
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Stack gap="lg">
          <Lede>Who is in this Shoebox.</Lede>
          {isAdmin ? (
            <MembersDirectory />
          ) : (
            <Prose onPanel>Only an admin can manage members.</Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
