import { createFileRoute } from "@tanstack/react-router";
import { MembersSurface } from "@/surfaces/Members/MembersSurface/MembersSurface";

export const Route = createFileRoute("/_app/members")({
  staticData: { hasOwnBar: true },
  component: MembersSurface,
});
