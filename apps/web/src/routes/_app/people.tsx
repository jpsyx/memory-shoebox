import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { z } from "zod";
import { PeopleSurface } from "@/surfaces/People/PeopleSurface/PeopleSurface";

export const Route = createFileRoute("/_app/people")({
  validateSearch: z.object({ q: z.string().optional() }),
  component: PeoplePage,
});

/** Surface 7's route body: the directory, filtered by whatever `q` says. */
function PeoplePage(): ReactNode {
  const { q } = Route.useSearch();
  return <PeopleSurface q={q} />;
}
