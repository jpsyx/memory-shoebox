import { createFileRoute } from "@tanstack/react-router";
import { RemovalRequestsSurface } from "@/surfaces/RemovalRequests/RemovalRequestsSurface/RemovalRequestsSurface";

export const Route = createFileRoute("/_app/removal-requests")({
  staticData: { hasOwnBar: true },
  component: RemovalRequestsSurface,
});
