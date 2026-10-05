import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";
import { SettingsSheets } from "@/surfaces/Settings/SettingsSurface/SettingsSheets";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
/** Surface 11: five focused sheets for deployment-wide administration. */
export function SettingsSurface(): ReactNode {
  const { viewer } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  const isAdmin = viewer.isAdmin && account.data?.me.role === "admin";
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Stack gap="lg">
          <Lede>Shoebox settings.</Lede>
          <Prose onPanel>
            One instance of Memory Shoebox is a Shoebox, and this is yours.
            Everything here belongs to the deployment rather than to a person:
            whatever is chosen is what everybody in it sees.
          </Prose>
          {isAdmin ? (
            <SettingsSheets />
          ) : (
            <Prose onPanel>Only an admin can manage Shoebox settings.</Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
