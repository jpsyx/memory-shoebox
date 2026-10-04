import type { ReactNode } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { TopBar } from "@/system/Chrome/TopBar";
import { MilestonesPage } from "./MilestonesPage";
const MILESTONE_ROUTE = getRouteApi("/_app/milestones");
/** Occasion list and address-backed create/edit/empty/delete flow. */
export function MilestonesSurface(): ReactNode {
  const { viewer } = MILESTONE_ROUTE.useRouteContext();
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <MilestonesPage key={viewer.memberId} viewer={viewer} />
    </>
  );
}
