import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Banner } from "@/system/Chrome/Banner";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { ActivityLog } from "../ActivityLog";

/**
 * Historical administrative changes, rendered only for the current active
 * admin.
 */
export function ChangesSurface(): ReactNode {
  const { viewer, settings } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  const filters = useSearch({ from: "/_app/changes" });
  const isAdmin = viewer.isAdmin && account.data?.me.role === "admin";
  const timezone = account.data?.settings.timezone ?? settings.timezone;
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Stack gap="lg">
          <Lede>What has been changed.</Lede>
          {isAdmin ? (
            <>
              <Prose onPanel>
                Who may see what, who may do what, what was deleted, and getting
                in. Comments, reactions and uploads are in the archive already.
                These rows preserve the changes that would otherwise disappear.
              </Prose>
              <ActivityLog filters={filters} timezone={timezone} />
              <Banner onPanel>
                <b>Only an admin sees this, and the log keeps its history.</b>{" "}
                Labels and devices are recorded at the time. A deleted thing
                keeps its place here, without a link that depends on it still
                existing.
              </Banner>
            </>
          ) : (
            <Prose onPanel>Only an admin can view changes.</Prose>
          )}
        </Stack>
      </Page>
    </>
  );
}
