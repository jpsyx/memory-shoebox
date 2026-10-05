import { createFileRoute } from "@tanstack/react-router";
import { GroupsSurface } from "@/surfaces/Groups/GroupsSurface/GroupsSurface";

/** Administrative groups draw their own account back bar. */
export const Route = createFileRoute("/_app/groups")({
  staticData: { hasOwnBar: true },
  component: GroupsSurface,
});
