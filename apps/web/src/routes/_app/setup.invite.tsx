import { createFileRoute } from "@tanstack/react-router";
import { SetupInvitations } from "@/surfaces/Setup/SetupInvitations";

/** Private admin invitation step with its own narrow setup bar. */
export const Route = createFileRoute("/_app/setup/invite")({
  staticData: { hasOwnBar: true },
  component: SetupInvitations,
});
