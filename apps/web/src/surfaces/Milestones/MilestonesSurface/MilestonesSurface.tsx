import { TopBar } from "@/system/Chrome/TopBar";
import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MilestonesPage } from "./MilestonesPage";
const MilestoneRoute = getRouteApi("/_app/milestones") satisfies ReturnType<
  typeof getRouteApi<"/_app/milestones">
>;
/** Occasion list and address-backed create/edit/empty/delete flow. */
export function MilestonesSurface(): ReactNode {
  const { viewer } = MilestoneRoute.useRouteContext();
  return (
    <>
      <TopBar back={{ label: "Back to my account", to: "/account" }} />
      <MilestonesPage key={viewer.memberId} viewer={viewer} />
    </>
  );
}
