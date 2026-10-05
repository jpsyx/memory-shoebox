import { createFileRoute } from "@tanstack/react-router";
import { idSchema } from "@memory-shoebox/shared";
import { z } from "zod";
import { PresenceSurface } from "@/surfaces/Presence/PresenceSurface/PresenceSurface";

/**
 * Presence's item address is optional and validated independently from member
 * reads.
 */
export const Route = createFileRoute("/_app/presence")({
  staticData: { hasOwnBar: true },
  validateSearch: z.object({ itemId: idSchema.optional() }),
  component: PresenceSurface,
});
