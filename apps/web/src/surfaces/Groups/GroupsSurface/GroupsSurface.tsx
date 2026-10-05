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
            Named sets of people, so who can see something can be said in one
            word instead of nine names. Flat, with no nesting, and a person can
            be in as many as you like.
          </Prose>
          {isAdmin ? (
            <>
              <Banner onPanel>
                <strong>
                  Groups are worked out when somebody looks, not when something
                  goes up.
                </strong>{" "}
                Add somebody to a group and they get everything that was ever
                restricted to it. Take them out and it all closes again. Nothing
                is fixed at the moment of upload.
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
