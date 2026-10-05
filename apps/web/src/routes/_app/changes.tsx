import { createFileRoute } from "@tanstack/react-router";
import { activityRequestSchema } from "@memory-shoebox/shared";
import { ChangesSurface } from "@/surfaces/Changes/ChangesSurface/ChangesSurface";

/** Combined URL history filters preserve bounded historical setting keys. */
export const Route = createFileRoute("/_app/changes")({
  staticData: { hasOwnBar: true },
  validateSearch: activityRequestSchema.pick({
    family: true,
    actorMemberId: true,
    subjectId: true,
  }),
  component: ChangesSurface,
});
