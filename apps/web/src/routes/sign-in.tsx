import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignInCard } from "@/surfaces/SignIn/SignInCard/SignInCard";

const searchSchema = z.object({
  /** Where to go once they are in. A link is an address, never a credential. */
  redirect: z.string().optional(),
  /**
   * The address, pre-filled.
   *
   * `z.string()` rather than `z.email()` on purpose. An invitation link
   * carries the address as a plain query parameter purely so the field
   * arrives filled in, and **nothing validates it before submission**
   * (Decision 2). A schema that rejected a malformed one would put the match
   * into error and show somebody a broken page instead of a form they could
   * correct.
   */
  email: z.string().optional(),
  /** Whether a code has been asked for, so the code field is shown. */
  sent: z.boolean().optional(),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  component: SignInCard,
});
