import type { AnyRoute } from "@tanstack/react-router";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/** Invitation address is a correctable prefill, never an access credential. */
export const Route = createFileRoute("/join")({
  validateSearch: z.object({ address: z.coerce.string().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/sign-in",
      search: { email: search.address },
      replace: true,
    });
  },
}) satisfies Pick<AnyRoute, "id" | "path" | "fullPath">;
