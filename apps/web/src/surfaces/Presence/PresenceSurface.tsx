import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { PresenceDirectory } from "./PresenceDirectory";
import { ItemViewers } from "./ItemViewers";
import { PresenceAbsences } from "./PresenceAbsences";

/** Admin participation and item-opening observations, gated by current authority. */
export function PresenceSurface(): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  const { itemId } = useSearch({ from: "/_app/presence" });
  const isAdmin = viewer.isAdmin && account.data?.me.role === "admin";
  const timezone = account.data?.settings.timezone ?? settings.timezone;
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Stack gap="lg">
          <Lede>Who has been looking.</Lede>
          {isAdmin ? (
            <>
              <Prose onPanel>
                Whether somebody is here: who signs in, who opens things, who
                writes something back. These figures describe participation in
                this Shoebox.
              </Prose>
              {itemId === undefined ? (
                <PresenceDirectory timezone={timezone} />
              ) : (
                <ItemViewers itemId={itemId} timezone={timezone} />
              )}
              <PresenceAbsences />
            </>
          ) : (
            <Prose onPanel>Only an admin can view presence.</Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
