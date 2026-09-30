import { createFileRoute } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";
import { z } from "zod";
import { takeFirstSignIn } from "@/session/firstSignIn/firstSignIn";
import { TimelineSurface } from "@/surfaces/Timeline/TimelineSurface";

/**
 * One value or many, both as an array.
 *
 * The router's default search parser reads `?tag=a&tag=b` as an array and
 * `?tag=a` as a bare string, so a schema demanding an array rejects the
 * single-filter case outright: the match lands in error and `beforeLoad`
 * never runs. Somebody pressing one tag is the commonest filter there is, and
 * a hand-typed or shared `?tag=hospital` has to work, because in this product
 * a URL is an address.
 *
 * A union rather than `z.preprocess`, because preprocess takes `unknown` in
 * and that `unknown` is what the router reads to type a `Link`'s `search`
 * prop: every caller would have had to name `tag` and `person` even when
 * setting neither.
 */
function _oneOrMany() {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      return value === undefined || Array.isArray(value) ? value : [value];
    });
}

const searchSchema = z.object({
  tag: _oneOrMany(),
  person: _oneOrMany(),
  from: z.string().optional(),
  until: z.string().optional(),
  /**
   * Where the stream starts, which the jump rail writes.
   *
   * A start position rather than a filter: it goes on the wire as `until`,
   * because the cursor is opaque and the client must not mint one, and it
   * deliberately never appears in the filter strip.
   */
  at: z.string().optional(),
  /** Whether the filter sheet is open. The "Find" button sets it. */
  find: z.boolean().optional(),
});

export const Route = createFileRoute("/_app/")({
  validateSearch: searchSchema,
  component: TimelinePage,
});

/**
 * The pile, filtered by whatever search parameters the URL carries.
 *
 * A filtered pile is the pile with search parameters on it, not a different
 * surface: "the result is the pile again: same spine, same prints, same
 * stacks" (`design-spec.md` § User flows). Surfaces 2, 5 and 6 are all here.
 *
 * No `Page` wrapper: `Archive`, inside `TimelineSurface`, is this surface's
 * own landmark and `<main>` element, and nesting one `<main>` in another is
 * invalid.
 *
 * The first-sign-in banner lives inside `TimelineSurface` rather than here:
 * finishing its sentence needs the rail's own total, which the surface has
 * and this route does not. This route keeps owning the once-per-mount read
 * of the flag itself.
 */
function TimelinePage(): ReactNode {
  // `takeFirstSignIn` clears as it reads, so it must run once per mount.
  // Not `useState`: `main.tsx` wraps the app in `StrictMode`, which
  // double-invokes a lazy initialiser, and this one would consume the flag
  // twice. A ref, once set, is not initialised again on the second pass.
  const isFirstSignInRef = useRef<boolean | undefined>(undefined);
  isFirstSignInRef.current ??= takeFirstSignIn();
  const search = Route.useSearch();

  return (
    <TimelineSurface search={search} isFirstSignIn={isFirstSignInRef.current} />
  );
}
