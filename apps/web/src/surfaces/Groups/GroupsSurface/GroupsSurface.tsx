import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";
import { GroupsDirectory } from "@/surfaces/Groups/GroupsSurface/GroupsDirectory";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { Banner } from "@/system/Chrome/Banner";
/** Surface 13 manages groups and explicit directional deletion consent. */
export function GroupsSurface(): ReactNode {
  const { viewer } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  const isAdmin = viewer.isAdmin && account.data?.me.role === "admin";
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Stack gap="lg">
          <Lede>Groups.</Lede>
          <Prose onPanel>
            Use groups to choose who can see photographs. A person can belong to
            more than one group.
          </Prose>
          {isAdmin ? (
            <>
              <Banner onPanel>
                <strong>Group changes apply to existing photographs.</strong>{" "}
                Adding or removing a member changes their access immediately.
              </Banner>
              <GroupsDirectory />
            </>
          ) : (
            <Prose onPanel>Only an admin can manage groups.</Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
