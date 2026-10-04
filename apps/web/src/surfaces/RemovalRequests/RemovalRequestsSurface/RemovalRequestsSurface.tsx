import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Page } from "@/system/Chrome/Page";
import { TopBar } from "@/system/Chrome/TopBar";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { RemovalQueue } from "./RemovalQueue";

const APP_ROUTE = getRouteApi("/_app");

/** Uploader/admin queue access is distinct from per-request action authority. */
export function RemovalRequestsSurface(): ReactNode {
  const { viewer } = APP_ROUTE.useRouteContext();
  const hasDeleted = useRouterState({
    select: (state) => {
      return state.location.state.removalDeleted === true;
    },
  });
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <Page wide>
        <Lede>Removal requests.</Lede>
        {hasDeleted ? (
          <Prose onPanel role="status">
            The photograph was deleted.
          </Prose>
        ) : null}
        {viewer.role === "viewer" ? (
          <Prose onPanel>
            Removal requests are available to uploaders and admins.{" "}
            <a href="/account">Back to my account</a>.
          </Prose>
        ) : (
          <RemovalQueue key={viewer.memberId} viewer={viewer} />
        )}
      </Page>
    </>
  );
}
